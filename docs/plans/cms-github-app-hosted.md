# Plan: Hosted CMS GitHub App Tokens

## Status

Proposed. Replaces long-lived shared CMS PATs for hosted Rover/content repos with short-lived GitHub App installation tokens.

This is a hosted-product successor to the passkey-gated PAT path in [CMS operator login](./cms-operator-login.md). It keeps Sveltia on its GitHub backend, so the browser still receives a GitHub token, but the token is minted on demand, scoped to one content repo, and expires automatically.

## Context

Hosted Rover currently creates private content repositories for users during onboarding, e.g.:

```text
rizom-ai/rover-<handle>-content
```

That matters: hosted users do not need to bring a GitHub account, create a PAT, or grant repo access themselves. The platform already controls repository creation and can also control CMS write access.

The current passkey CMS path stores a long-lived fine-grained PAT (`CMS_CONTENT_REPO_PAT`) and releases it to Sveltia after operator authentication. That works, but it has two weaknesses:

- the credential is long-lived until manually rotated;
- the credential must be provisioned and stored per hosted repo/user.

A GitHub App installation token is a better hosted default:

- minted just in time;
- expires, typically after about one hour;
- scoped by GitHub App permissions and optionally by repository;
- revocable by removing the repo/app installation;
- no per-user PAT creation ceremony.

## Goal

For hosted content repos created by the platform, let `/auth` mint a short-lived GitHub App installation token after validating the brain operator session, then hand that token to Sveltia using the existing Sveltia GitHub auth handshake.

The target hosted editor flow:

1. Operator logs into the brain with passkey.
2. Operator opens `/cms`.
3. CMS auth uses the existing operator session.
4. Brain mints a GitHub App installation token for that brain's content repo.
5. Sveltia receives the token and commits directly to GitHub.
6. No stored repo PAT is needed.

## Non-goals

- Removing GitHub from the CMS write path.
- Hiding all GitHub credentials from the browser. Sveltia's GitHub backend needs a browser token to commit directly.
- Per-editor GitHub commit identity for passkey-only hosted editors. Commits will be attributed to the GitHub App/bot identity unless Sveltia can set commit author metadata separately.
- Supporting user-owned arbitrary GitHub repos in the first pass. This plan is specifically for repos created/owned by the hosted platform.
- Building a brain-side git gateway.

## GitHub App setup

Create a Rizom/Brains GitHub App with minimal permissions:

- Repository permissions:
  - `Contents: read/write`
  - optionally `Metadata: read` (GitHub Apps get metadata by default)
- No org administration permissions for runtime token minting.
- Installed on the org/account that owns hosted content repos.

Recommended hosted setup:

- Install the GitHub App on **all repositories** in the hosted content repo owner account/org, or on a dedicated org that contains only hosted content repos.
- If using selected-repo installation, repo creation must include an explicit app-installation access step; verify GitHub's API constraints before choosing this path.

Runtime secrets/config:

```ts
cmsPlugin({
  githubAppLogin: {
    appId: env.CMS_GITHUB_APP_ID,
    privateKey: env.CMS_GITHUB_APP_PRIVATE_KEY,
    installationId: env.CMS_GITHUB_APP_INSTALLATION_ID,
  },
});
```

The content repo itself still comes from git-sync repo info (`git-sync:get-repo-info`), so the CMS plugin can mint a token for the active repo without duplicating repo config.

## Token minting flow

`GET /auth` with GitHub App login enabled:

1. Verify there is a valid operator session via `auth-service`.
2. If no session, render/redirect to the standard operator login flow.
3. Resolve content repo from `git-sync:get-repo-info`.
4. Sign a GitHub App JWT using `appId` + `privateKey`.
5. Call GitHub:

```http
POST /app/installations/:installation_id/access_tokens
Authorization: Bearer <app-jwt>
Accept: application/vnd.github+json
```

With an optional repo restriction:

```json
{
  "repositories": ["rover-alice-content"],
  "permissions": { "contents": "write" }
}
```

6. GitHub returns a short-lived installation token.
7. Brain returns the existing Sveltia-compatible popup handshake page:

```js
authorization:github:success:{"token":"...","provider":"github"}
```

8. Sveltia commits directly to GitHub using the installation token.

## Hosted repo provisioning integration

Update hosted repo provisioning so every hosted content repo is app-accessible.

For `brains-ops` / hosted onboarding:

1. Create the private content repo as today.
2. Ensure the GitHub App installation can access it.
   - Preferred: app installed on all repos in the hosted content owner org, so new repos are automatically covered.
   - Alternative: if selected-repo installations are required, add an explicit post-create access step and test it end-to-end.
3. Record the repo as today in `brain.yaml` / directory-sync config.
4. Runtime deploy provides app credentials and installation id, not a repo PAT.

Possible env/schema additions for hosted Rover:

```env
CMS_GITHUB_APP_ID=
CMS_GITHUB_APP_PRIVATE_KEY=
CMS_GITHUB_APP_INSTALLATION_ID=
```

These can be shared deployment secrets for the hosted fleet if all hosted repos live under one installation.

## CMS plugin config shape

Add a third mutually-exclusive CMS login method:

```ts
cmsPlugin({
  githubAppLogin: {
    appId: string;
    privateKey: string;
    installationId: string;
  },
});
```

Rules:

- Exactly zero or one CMS login methods may be enabled:
  - `githubOAuth`
  - `passkeyLogin`
  - `githubAppLogin`
- `githubAppLogin` requires `auth-service`; token minting is refused without a valid operator session.
- `/cms/config.yml` includes `base_url` and `auth_endpoint: auth` only when a login method is enabled.

## UX shape

Minimum viable hosted UX:

- `/cms` requires an operator session.
- If unauthenticated, redirect to `/login?return_to=/cms`.
- After passkey login, user returns to `/cms`.
- Sveltia opens `/auth`, `/auth` sees the operator session, mints the GitHub App token, completes the handshake, and closes.

Optional improved UX:

- Pre-bootstrap Sveltia's persisted auth state on `/cms` after validating the operator session, so the user does not see Sveltia's sign-in button.
- This likely depends on Sveltia's current `localStorage` key (`sveltia-cms.user`) and should be treated as a compatibility shim with regression tests.
- Do **not** auto-click Sveltia UI controls; that is brittle and not an auth contract.

## Security properties

Improves over PAT:

- No long-lived repo-write PAT stored per user/repo.
- Browser token expires automatically.
- Token can be scoped to one repository and contents write.
- Revocation can happen by removing the app installation/repo access.

Still true because Sveltia commits from the browser:

- A valid operator can extract the active GitHub token from devtools/localStorage/network.
- XSS in CMS can exfiltrate the active token.
- Token exposure window is limited by expiration, not eliminated.

Operational requirements:

- Keep the GitHub App private key in the runtime secret backend.
- Rotate GitHub App private keys periodically.
- Log token minting events without logging token values.
- Avoid caching token responses.

## Implementation phases

### Phase 1 — token provider in CMS plugin

- Add `githubAppLogin` config schema.
- Add GitHub App JWT signing helper.
- Add installation token minting helper.
- Reuse `/auth` and the existing Sveltia handshake.
- Add tests for:
  - missing operator session returns login/401;
  - repo info is required;
  - JWT exchange request shape;
  - token response uses no-store and never logs token;
  - config rejects multiple login methods.

### Phase 2 — Rover hosted env/schema wiring

- Add hosted env schema entries for GitHub App credentials.
- Wire Rover hosted/default config to `cmsPlugin({ githubAppLogin })` when app env vars are present.
- Keep `CMS_CONTENT_REPO_PAT` as a local/legacy fallback only if explicitly configured.

### Phase 3 — brains-ops hosted provisioning

- Ensure content repo creation lands in an app-covered owner/org.
- Add preflight check: created repo is accessible to the GitHub App installation.
- Fail onboarding/reconcile with a clear operator message if app access is missing.
- Document required GitHub App installation mode.

### Phase 4 — UX cleanup

- Make `/cms` operator-session aware.
- Redirect unauthenticated users to `/login?return_to=/cms`.
- Evaluate Sveltia pre-bootstrap via `sveltia-cms.user` localStorage with explicit regression tests.
- If pre-bootstrap is too brittle, keep popup handshake but ensure an already logged-in operator only sees Sveltia's auth transition briefly.

## Verification

1. Hosted repo without app access fails preflight before deployment/onboarding completes.
2. `/cms/config.yml` includes `auth_endpoint: auth` when `githubAppLogin` is configured.
3. `/auth` refuses to mint tokens without a valid operator session.
4. `/auth` mints a GitHub App installation token scoped to the active content repo.
5. Sveltia can commit to the hosted private repo with the installation token.
6. Token expires and a later CMS session can mint a new one.
7. Removing app access from the repo prevents CMS writes.
8. No GitHub token value is logged or embedded before operator auth.

## Open questions

- Should the GitHub App be installed on all hosted content repos or selected repos only?
- Can Sveltia reliably use GitHub App installation tokens for all GitHub API calls it makes, including commit history and file reads?
- Do we want bot-authored commits, or should we configure commit author metadata where Sveltia supports it?
- Is Sveltia localStorage pre-bootstrap stable enough to use, or should we keep only the official popup handshake?

## Related

- [CMS operator login](./cms-operator-login.md) — current GitHub OAuth / passkey PAT flow
- [Rover default batch onboarding](./rover-default-batch-onboarding.md) — hosted repo provisioning context
- [Hosted rovers on Kubernetes](./hosted-rovers.md) — hosted runtime direction
- `plugins/cms` — CMS config and auth route owner
- `packages/brains-ops` — hosted repo creation and reconciliation
