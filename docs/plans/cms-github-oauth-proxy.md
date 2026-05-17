# Plan: CMS GitHub OAuth Proxy

## Status

Proposed tactical interim. This is the small CMS OAuth plan: a temporary GitHub OAuth code-exchange proxy hosted by `plugins/cms` for Sveltia's existing GitHub backend.

This is not the brain's passkey/OAuth identity system and not the long-term CMS gateway. It exists only until [CMS heavy backend](./cms-heavy-backend.md) replaces Sveltia's direct GitHub write path with a brain-hosted git gateway.

## Context

The CMS today is a Sveltia SPA mounted at `/cms` by `plugins/cms`. Sveltia uses the GitHub backend and needs a GitHub OAuth flow to receive a GitHub access token in the browser.

The GitHub OAuth client secret cannot live in browser code, so Sveltia needs a server-side code-exchange proxy. External proxies such as Netlify-style OAuth providers or Cloudflare Workers can do this, but `plugins/cms` already owns `/cms` and `/cms/config.yml`, so hosting the throwaway proxy in the brain keeps CMS deployment self-contained.

## Goal

Provide a minimal, per-brain GitHub OAuth proxy so Sveltia can authenticate against GitHub without a separate external OAuth proxy.

Runtime flow:

1. User opens `/cms`.
2. Sveltia loads `/cms/config.yml`.
3. User clicks GitHub login.
4. Sveltia opens `https://<brain-domain>/auth` in a popup.
5. Brain redirects the popup to GitHub OAuth with a state value.
6. GitHub redirects back to `https://<brain-domain>/auth/callback`.
7. Brain verifies state and exchanges `code` + `client_secret` for a GitHub access token.
8. Callback page sends the token to the opener window using the Decap/Sveltia popup handshake.
9. Sveltia continues to talk directly to GitHub using the token.

## Non-goals

- Replacing GitHub as the CMS write backend.
- Letting editors authenticate with brain passkeys instead of GitHub.
- Hiding GitHub from editors; editors still need GitHub repo access.
- Implementing the Decap/Sveltia Git Gateway protocol.
- Adding drafts, approvals, scheduled publishing, or schema validation before commit.

Those belong to [CMS heavy backend](./cms-heavy-backend.md).

## Setup

Per brain deployment, the operator registers a GitHub OAuth App at `github.com/settings/developers`:

- Authorization callback URL: `https://<brain-domain>/auth/callback`

Resulting credentials stay in env, but are mapped into `plugins/cms` config by the brain definition rather than read directly by the plugin:

```ts
cmsPlugin({
  githubOAuth: {
    clientId: env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
    scope: "repo", // or "public_repo" for public-only repos
  },
});
```

The proxy is disabled unless both `clientId` and `clientSecret` are configured.

## Endpoints

Mounted by `plugins/cms` only when `githubOAuth` is configured.

### `GET /auth`

Initiates the flow:

1. Generates a cryptographically random `state`.
2. Stores it in a short-lived cookie.
3. Redirects to `https://github.com/login/oauth/authorize` with:
   - `client_id`
   - `redirect_uri`
   - `scope`
   - `state`

State cookie requirements:

- `HttpOnly`
- `Secure` outside local development
- `SameSite=Lax`
- short max age, e.g. 10 minutes
- deleted after callback completion

### `GET /auth/callback`

Completes the flow:

1. Verifies `state` from the query string against the state cookie.
2. Exchanges `code` + `client_secret` at GitHub's token endpoint.
3. Returns a small HTML callback page that runs the Decap/Sveltia popup handshake.

If GitHub returns an OAuth error or no `access_token`, the callback should return a clear 400 HTML/text response instead of a 500.

## Popup handshake

The callback page must not blindly post the GitHub token with `targetOrigin: "*"`. It should target the brain/CMS origin derived from `context.siteUrl` or, for local development, the incoming request origin.

The page should support Sveltia's `authorizing:github` handshake:

```js
const data = JSON.stringify({ token, provider: "github" });
const message = `authorization:github:success:${data}`;
const targetOrigin = "https://<brain-domain>";

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

## Sveltia config delta

When the proxy is enabled, `/cms/config.yml` includes `base_url` and `auth_endpoint`:

```yaml
backend:
  name: github
  repo: <org>/<content-repo>
  branch: main
  base_url: https://<brain-domain>
  auth_endpoint: auth
```

`base_url` + `auth_endpoint` tell Sveltia to open `https://<brain-domain>/auth` in a popup instead of going to Netlify's default proxy.

When the proxy is disabled, `auth_endpoint` must be omitted. `@brains/cms-config` needs to add explicit `auth_endpoint` support to `CmsConfig.backend`; emitting `base_url` alone should not accidentally imply that the proxy exists.

## Implementation shape

- Add optional `githubOAuth` config to `plugins/cms`.
- Add `auth_endpoint` support to `shared/cms-config`.
- Register `/auth` and `/auth/callback` only when the proxy is configured.
- Keep the implementation small and isolated so deletion is straightforward.

Reference: the Netlify CMS OAuth proxy and `vencax/netlify-cms-github-oauth-provider`, plus Sveltia-compatible callback behavior that waits for `authorizing:github` before sending the token.

## Verification

1. With no `githubOAuth` config, `/cms/config.yml` omits `auth_endpoint` and no `/auth` routes are registered.
2. With `githubOAuth` config, `/cms/config.yml` includes `base_url` and `auth_endpoint: auth`.
3. `GET /auth` sets a secure state cookie and redirects to GitHub with the configured scope.
4. `GET /auth/callback` rejects missing or mismatched state.
5. Successful callback exchanges the code server-side and returns a popup page that posts `authorization:github:success:{...}` only to the expected origin.
6. GitHub token-exchange errors return a clear 400.
7. Existing CMS shell and config routes keep working without OAuth config.

## Retirement

When the heavy backend gateway ships: delete `/auth` endpoints, drop `githubOAuth` config/env mapping, drop `auth_endpoint` generation, and switch Sveltia config to `git-gateway`. No migration shim, no compatibility code.

## Related

- [CMS heavy backend](./cms-heavy-backend.md) — long-term replacement for Sveltia's direct GitHub write path
- `plugins/cms` — owner of `/cms`, `/cms/config.yml`, and the temporary `/auth` routes
- `shared/cms-config` — needs conditional `auth_endpoint` generation
