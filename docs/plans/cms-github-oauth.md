# Plan: CMS GitHub OAuth Proxy (Tactical)

## Status

Proposed. Tactical fix, explicitly throwaway. Retired when `cms-heavy-backend.md` ships.

## Context

The CMS today is a Sveltia SPA mounted at `/cms` configured with `backend.name: github`. Sveltia's GitHub backend requires a server-side endpoint to exchange the OAuth authorization code for an access token, because the GitHub client secret cannot live in the browser. Without that endpoint, "Login with GitHub" in the CMS shell does not complete — Sveltia gets a code from GitHub but has no way to redeem it.

Today there is no such endpoint on the brain. The CMS surface is incomplete in production deployments that haven't wired up an external proxy (Netlify's hosted one, a Cloudflare Worker, etc.).

## Goal

The brain hosts a minimal GitHub OAuth proxy as part of `plugins/admin`. Operators register one GitHub OAuth App per brain deployment, set two env vars, and Sveltia's GitHub login flow works end-to-end against the existing content repo.

## Non-goals

- Replacing the Sveltia → GitHub commit path. This plan only fixes the auth dance; commits still flow direct from Sveltia to GitHub.
- Any brain-side identity, gating, or attribution. The brain is a dumb OAuth-code-exchange proxy here. The brain's own OAuth provider (`brain-oauth-provider.md`) is unrelated; this is GitHub-side OAuth.
- Surviving past `cms-heavy-backend.md`. When the heavy backend ships, the brain holds one GitHub credential, Sveltia switches to `git-gateway`, and this proxy is deleted. Build with that retirement in mind.
- Multi-provider support (GitLab, Gitea, etc.). GitHub only.

## Design

### GitHub OAuth App registration

Per brain deployment, the operator registers a GitHub OAuth App at `github.com/settings/developers`:

- Application name: any
- Homepage URL: brain URL
- Authorization callback URL: `https://<brain-domain>/auth/callback`

Resulting `Client ID` and `Client Secret` go into env:

```bash
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
```

### Endpoints (mounted by `plugins/admin`)

**`GET /auth`** — initiates the flow.

- Generates a random `state` and stores in a short-lived signed cookie
- Redirects to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, `scope=repo` (or `public_repo` for public content repos), `state`

**`GET /auth/callback`** — completes the flow.

- Verifies `state` matches the cookie
- POSTs `code` + `client_secret` to `https://github.com/login/oauth/access_token`
- Receives access token
- Returns an HTML page that runs the Decap/Sveltia popup handshake:

```js
window.opener.postMessage(
  `authorization:github:success:${JSON.stringify({ token, provider: "github" })}`,
  "*",
);
window.close();
```

Sveltia listens for this exact message format on the opener window. The protocol is documented in Decap CMS's docs and inherited verbatim.

### Sveltia config delta

`shared/cms-config` (or `plugins/admin`'s config generation, depending on which package owns it post-`cms-on-core` migration) emits:

```yaml
backend:
  name: github
  repo: <org>/<content-repo>
  base_url: https://<brain-domain>
  auth_endpoint: auth
```

`base_url` + `auth_endpoint` together tell Sveltia to open `https://<brain-domain>/auth` in a popup instead of going to Netlify's default proxy.

### Implementation size

Two endpoints, ~80 lines of Hono on the brain. Reference: the Netlify CMS OAuth proxy and `vencax/netlify-cms-github-oauth-provider` are the canonical small implementations to crib from.

## Rollout

1. Wire `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` into the brain config schema and env templates
2. Implement `/auth` and `/auth/callback` in `plugins/admin`
3. Update `shared/cms-config` to emit `base_url` + `auth_endpoint` pointing at the brain
4. Document the GitHub OAuth App registration step in operator setup docs
5. Verify end-to-end: fresh brain, register OAuth App, set env vars, log in via CMS, edit a file, see it commit
6. When `cms-heavy-backend.md` ships: delete `/auth` endpoints, drop the env vars from the schema, switch Sveltia config to `git-gateway`

## Verification

1. Operator with `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` set can complete the GitHub login flow from the CMS shell
2. Without those env vars, `/auth` returns a clear error pointing at the setup docs
3. State CSRF check rejects mismatched callbacks
4. After login, Sveltia commits flow to the content repo as the logged-in GitHub user
5. The whole proxy is removed cleanly when `cms-heavy-backend.md` lands — no migration shim, no compatibility code

## Related

- `docs/plans/cms-heavy-backend.md` — supersedes this plan in full; sequencing question is which lands first
- `docs/plans/cms-on-core.md` — establishes `plugins/admin` as the home for CMS routes
- `docs/plans/brain-oauth-provider.md` — unrelated (different OAuth: brain's own issuer, not GitHub's)
