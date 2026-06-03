# Plan: CMS Operator Login

## Status

Proposed. Lets editors authenticate to the CMS. Offers two login methods that share one popup-handshake substrate:

1. **GitHub OAuth** — brain performs the server-side GitHub OAuth code exchange and hands Sveltia the editor's own GitHub token.
2. **Passkey-gated PAT** — editor authenticates with the brain passkey; on success the brain releases one stored, narrowly-scoped GitHub PAT.

Both keep Sveltia on its existing GitHub backend, which is the only backend family Sveltia supports for self-hosted content (GitHub, GitLab, Gitea/Forgejo). Sveltia has no `git-gateway` backend and the project has stated it never will, so a brain-mediated commit path is **not** an option with Sveltia — the brain can only hand Sveltia a token, not stand between Sveltia and GitHub.

That bounds the scope deliberately. The shared-credential trade-offs of the passkey path (below) are **accepted, not deferred**: there is no planned heavier successor. If a future multi-user/team-authoring case needs per-editor attribution and per-user revocation, the right move is to reassess the CMS tool itself (Sveltia → something with a self-hosted backend), not to build a brain-side git gateway. See [multi-user](./multi-user.md) for the broader user model, which is independent of this CMS choice.

## Context

The CMS today is a Sveltia SPA mounted at `/cms` by `plugins/cms`. Sveltia uses the GitHub backend and needs a GitHub access token in the browser to commit. It obtains that token through a popup OAuth handshake: the popup posts `authorization:github:success:{token}` back to the opener, and Sveltia then talks directly to GitHub.

Sveltia does not care _how_ the popup produced the token — only that a valid GitHub token arrives through the handshake. That is the seam both login methods plug into.

The GitHub OAuth client secret cannot live in browser code, so a server-side code-exchange step is required for method 1. Method 2 reuses the same popup/handshake but swaps the GitHub OAuth dance for a brain passkey assertion followed by release of a brain-held PAT. `plugins/cms` already owns `/cms` and `/cms/config.yml`, so hosting both flows in the brain keeps CMS deployment self-contained.

## Goal

Provide a per-brain CMS login popup that offers GitHub OAuth and/or passkey sign-in, so editors can authenticate Sveltia without a separate external OAuth proxy, and so editors without GitHub accounts can still edit via the brain passkey.

The two methods cover a spectrum:

- **GitHub OAuth** — for editors who already have GitHub repo access. Commits are attributed to their real GitHub identity. No shared credential leaves the server beyond the editor's own token.
- **Passkey-gated PAT** — for editors with no GitHub account. Commits are attributed to the shared PAT identity. The brain releases the PAT only after a verified passkey assertion.

A deployment enables exactly one method per brain. Configuring both is a config-time error, since the two paths produce different commit identities (real GitHub user vs shared PAT) and mixing them on one brain isn't a current need. If a single brain ever needs to serve both a GitHub-account editor and a passkey-only editor, revisit this and add a chooser at `/auth` (Sveltia opens `/auth` with no method hint and only waits for the handshake, so an intermediate chooser page is compatible).

## Non-goals

- Replacing GitHub as the CMS write backend.
- Standing the brain between Sveltia and GitHub (a brain-mediated/git-gateway commit path). Sveltia does not support this — see Status.
- Per-editor commit attribution for the passkey path. With a shared PAT, all passkey-path commits share one author. Sveltia cannot give us per-user attribution here, and we are not building a gateway to add it.
- Per-user revocation for the passkey path. Revoking access = rotating the shared PAT and re-releasing it. There is no per-editor revoke.
- Drafts, approvals, scheduled publishing, or schema validation before commit.

If those become real requirements, they signal that Sveltia is no longer the right CMS — not that this plan should grow a backend.

## Shared substrate: popup + handshake

Both methods end the same way. The popup, on success, posts the GitHub token to the opener using Sveltia's handshake and then closes:

```js
const data = JSON.stringify({ token, provider: "github" });
const message = `authorization:github:success:${data}`;
const targetOrigin = "https://<brain-domain>"; // from context.siteUrl; request origin in local dev

function sendToken() {
  window.opener.postMessage(message, targetOrigin);
  window.close();
}

window.addEventListener(
  "message",
  (event) => {
    if (event.origin === targetOrigin && event.data === "authorizing:github") {
      sendToken();
    }
  },
  false,
);

// Decap-style readiness signal; Sveltia replies with `authorizing:github`.
window.opener.postMessage("authorizing:github", targetOrigin);
```

The callback page must not post the token with `targetOrigin: "*"`. It targets the brain/CMS origin derived from `context.siteUrl`, or the incoming request origin in local development.

### Sveltia config delta

When any login method is enabled, `/cms/config.yml` includes `base_url` and `auth_endpoint`:

```yaml
backend:
  name: github
  repo: <org>/<content-repo>
  branch: main
  base_url: https://<brain-domain>
  auth_endpoint: auth
```

This tells Sveltia to open `https://<brain-domain>/auth` in a popup instead of going to Netlify's default proxy. When no method is enabled, `auth_endpoint` must be omitted. `@brains/cms-config` needs explicit `auth_endpoint` support on `CmsConfig.backend`; emitting `base_url` alone must not imply a login endpoint exists. (`CmsConfig.backend` is currently `{ name, repo, branch, base_url? }` — add `auth_endpoint?`.)

### `GET /auth` — single method dispatch

Serves the login popup. Exactly one method is enabled per brain, so dispatch is on what is configured:

- GitHub enabled: redirect straight to GitHub.
- Passkey enabled: render the passkey assertion page — or, if the request already carries a valid operator session, skip straight to releasing the PAT.

## Method 1 — GitHub OAuth

Per brain deployment, the operator registers a GitHub OAuth App at `github.com/settings/developers`:

- Authorization callback URL: `https://<brain-domain>/auth/callback`

Credentials stay in env, mapped into `plugins/cms` config by the brain definition rather than read directly by the plugin:

```ts
cmsPlugin({
  githubOAuth: {
    clientId: env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
    scope: "repo", // or "public_repo" for public-only repos
  },
});
```

The GitHub OAuth method is disabled unless both `clientId` and `clientSecret` are configured.

### Flow

`GET /auth` (GitHub button or GitHub-only mode):

1. Generates a cryptographically random `state`.
2. Stores it in a short-lived cookie (`HttpOnly`, `Secure` outside local dev, `SameSite=Lax`, ~10 min, deleted after callback).
3. Redirects to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, `scope`, `state`.

`GET /auth/callback`:

1. Verifies `state` from the query string against the state cookie.
2. Exchanges `code` + `client_secret` at GitHub's token endpoint.
3. Returns the shared handshake page carrying the GitHub token.

If GitHub returns an OAuth error or no `access_token`, return a clear 400 HTML/text response, not a 500.

## Method 2 — Passkey-gated PAT

The brain holds one GitHub credential, scoped narrowly (fine-grained PAT, `contents:write` on the content repo only — not the org, not other repos). It is released to the browser only after a verified brain passkey assertion.

```ts
cmsPlugin({
  passkeyLogin: {
    // PAT mapped in by the brain definition from env, like other secrets
    contentRepoToken: env.CMS_CONTENT_REPO_PAT,
  },
});
```

The passkey method is disabled unless `contentRepoToken` is configured.

### Flow

`GET /auth` (passkey button or passkey-only mode) serves a page that runs a WebAuthn assertion against the brain's existing passkey infrastructure (`shell/auth-service` already performs passkey login for the dashboard; reuse those endpoints/logic rather than adding a parallel WebAuthn stack).

On a successful assertion that establishes a valid operator session:

1. The page calls an authenticated endpoint, e.g. `POST /auth/cms-token`, which requires the freshly-established operator session.
2. The endpoint returns the configured `contentRepoToken`.
3. The page posts that token via the shared handshake.

The PAT is returned only to a request bearing a valid operator session from the just-completed passkey assertion. It is never embedded in the initial page HTML.

### Accepted trade-offs

- The PAT lands in the editor's browser. Any editor who completes passkey login holds the raw repo-write credential and can use it against GitHub directly until rotation. Scope it minimally to cap blast radius.
- Commits via this path share one author identity. Per-editor attribution is not achievable through Sveltia's GitHub backend.
- Revocation is all-or-nothing: rotate the PAT.
- XSS on the CMS page can exfiltrate the token.

These are acceptable for a small trusted operator/editor set, which is the current reality. A larger team that needs individual attribution and revocation is the signal to move off Sveltia, not to harden this path.

## Implementation shape

- Add optional `githubOAuth` and `passkeyLogin` config to `plugins/cms`.
- Add `auth_endpoint` support to `shared/cms-config` (`CmsConfig.backend.auth_endpoint?`).
- Register `/auth` (+ `/auth/callback` for GitHub, `/auth/cms-token` for passkey) only when at least one method is configured.
- Reuse `shell/auth-service` passkey assertion + operator session for method 2; do not add a second WebAuthn implementation.
- Keep the implementation small and isolated so deletion is straightforward when the gateway ships.

Reference for the GitHub path: the Netlify CMS OAuth proxy and `vencax/netlify-cms-github-oauth-provider`, plus Sveltia-compatible callback behavior that waits for `authorizing:github` before sending the token.

## Verification

1. With no login config, `/cms/config.yml` omits `auth_endpoint` and no `/auth` routes are registered.
2. With GitHub config, `/cms/config.yml` includes `base_url` and `auth_endpoint: auth`; `GET /auth` (GitHub-only) sets a secure state cookie and redirects to GitHub with the configured scope.
3. `GET /auth/callback` rejects missing or mismatched state; successful callback exchanges the code server-side and posts `authorization:github:success:{...}` only to the expected origin; token-exchange errors return a clear 400.
4. With passkey config, `GET /auth` serves a WebAuthn assertion page; a successful assertion lets `POST /auth/cms-token` return the PAT; the page posts it via the handshake.
5. `POST /auth/cms-token` refuses to return the PAT without a valid operator session from a completed passkey assertion.
6. Configuring both `githubOAuth` and `passkeyLogin` is a config-time error.
7. The released PAT never appears in the initial page HTML or in logs.
8. Existing CMS shell and config routes keep working without any login config.

## Retirement

This login goes away only if Sveltia itself is replaced. If/when the CMS tool changes (e.g. for a team-authoring case Sveltia can't serve), delete `/auth` routes, drop `githubOAuth`/`passkeyLogin` config and env mapping, and drop `auth_endpoint` generation as part of that migration. No migration shim, no compatibility code.

## Related

- [Multi-user and permissions](./multi-user.md) — the brain-wide user model; independent of this CMS-login choice
- `plugins/cms` — owner of `/cms`, `/cms/config.yml`, and the `/auth` routes
- `shared/cms-config` — needs conditional `auth_endpoint` generation
- `shell/auth-service` — provides the passkey assertion + operator session reused by method 2
