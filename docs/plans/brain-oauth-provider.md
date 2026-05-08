# Plan: Brain OAuth Provider

## Status

In progress. OAuth provider foundation is implemented, Pi MCP has validated the MCP OAuth flow, and dashboard widgets can now opt into passkey-backed operator visibility. Remaining work is hardening and later multi-user/user-entity alignment.

## Context

The brain has accumulated several static bearer tokens for inbound auth:

- `MCP_AUTH_TOKEN` — single shared token at `interfaces/mcp/src/transports/http-server.ts:141`, used to gate `/mcp`
- `trustedTokens: Record<token, identity>` for A2A at `interfaces/a2a/src/config.ts:14`
- ad-hoc tokens for any future operator-facing surface

Two forces make this unsustainable:

1. Claude Desktop and other MCP clients now require OAuth 2.1 (with PKCE and dynamic client registration). A bearer-token MCP endpoint does not work with current MCP clients.
2. Static bearer tokens have no rotation, no revocation, no per-caller identity, and no audit. Any new operator-facing surface (CMS gate, dashboard, future admin) inherits the same fragility.

This plan introduces an embedded OAuth 2.1 authorization server inside the brain. The provider is the load-bearing piece for every human-facing surface. Once it lands, MCP works with Claude Desktop, the CMS shell can be gated, and `permissionService` receives a real verified caller identity instead of a token-as-identity proxy.

## Goal

A brain runs its own OAuth 2.1 authorization server. Operators authenticate once with a passkey. Claude Desktop, IDEs, browsers, and the CMS UI all obtain access tokens through the same provider. JWT validation is shared middleware reused by every protected route. Verified caller identity flows into the existing `permissionService` (anchor / trusted / public) unchanged.

## Non-goals

- Building a multi-tenant SaaS account system. The brain hosts its own operator(s); user records are local entities, not a hosted identity platform.
- Replacing A2A bearer tokens with OAuth. Brain-to-brain auth is RFC 9421 signatures (separate plan).
- Replacing Sveltia → GitHub commit flow. The CMS UI gets gated by this provider; the heavy CMS backend is a follow-on plan.
- Externalizing the issuer (Hellō, WorkOS, etc.). Decided against — see architectural decisions.
- Full RBAC beyond the existing anchor/trusted/public model.
- A passwordless option matrix. Passkeys only for v1; magic-link / TOTP can be added later if operators ask.

## Architectural decisions

### 1. Embedded provider, not external IdP

The provider runs in-process. Reasons:

- aligns with the rest of the architecture (every brain its own sovereign domain)
- no third party in the auth path; no outage couples the brain's login to a SaaS
- relay multi-user flow keeps users in the brain's own user model rather than a shared external IdP
- DCR (RFC 7591) is required for MCP and is first-class in `oidc-provider`

External providers stay as a future migration target. The wire is OIDC either way; swapping to a hosted issuer later is a JWKS-URL change.

### 2. Library choice

- `@simplewebauthn/server` for passkey enrollment and authentication
- `jose` for JWT signing and validation

The initial implementation uses a small in-process OAuth 2.1 provider tailored to Brain's single-operator/MCP needs instead of pulling in `oidc-provider` immediately. This keeps the trust boundary explicit while preserving the same wire protocol: discovery, DCR, PKCE authorization code flow, rotating refresh tokens, JWKS, and protected-resource metadata.

### 3. Passkey-only for operator login in v1

WebAuthn / passkeys are the only operator authentication mechanism initially. No password fallback, no magic links. Reasons:

- one mechanism is simpler to harden than several
- passkeys cover device-bound (Touch ID, Windows Hello) and roaming (YubiKey) without code changes
- operators are typically one or a small handful of people; the recovery story is "register a backup passkey"

Recovery from total credential loss is a manual brain-side reset (operator ssh's in and runs `brain auth reset-passkeys --yes`). Acceptable for the self-hosted scale.

### 4. JWT validation as shared middleware

A single Hono middleware module validates JWTs and attaches the verified identity (and the brain user record it resolves to) to the request context. Used by:

- MCP transport (replaces the current token compare)
- dashboard widgets that opt into operator-only visibility
- future operator-facing routes that do not already delegate auth to their own backend

The middleware is the integration point with `permissionService`.

### 5. Integration with the multi-user plan

User entities (per `docs/plans/multi-user.md`) are the durable identity. OAuth subjects map to user entities. Passkey credentials attach to user entities. The provider is the authentication mechanism; the user entity is the authenticated principal. The two plans are co-evolving — this plan assumes the user-entity model lands alongside it or shortly after.

If user entities are not yet ready, v1 supports a single-operator mode (one user record, one passkey, no management UI) consistent with the multi-user plan's "single-owner path must continue to work" requirement.

### 6. Package home

A new package at `shell/auth-service`. Owns:

- provider configuration and lifecycle
- passkey enrollment and authentication endpoints
- access-token signing and verification helpers
- signing key custody (separate from the A2A signing key)
- DCR-aware client storage
- operator sessions, authorization codes, passkeys, and refresh tokens

Mounted on the shared HTTP surface (`interfaces/webserver`) per `docs/plans/cms-on-core.md` direction.

## Design

### Provider configuration

- Issuer = `https://<brain-domain>` (production) or `http://localhost:<port>` (dev)
- Requests are accepted only for the configured issuer, explicitly configured trusted issuers (for example preview hosts), or localhost/127.0.0.1 when local-dev issuers allow it
- Signing keys: ES256 keypair generated on first boot, persisted in runtime auth storage outside `brain-data` (default `./data/auth`, `0600` perms)
- JWKS published at `/.well-known/jwks.json` (shared endpoint, also serves the A2A signing key when plan 1 lands)
- Authorization-server metadata at `/.well-known/oauth-authorization-server`
- Token lifetimes: short-lived access tokens (15 min), longer refresh tokens (30 days, rotating)
- Protected-resource metadata at `/.well-known/oauth-protected-resource`, including `scopes_supported: ["mcp"]`

### Endpoints

- `GET /.well-known/oauth-authorization-server` — provider metadata
- `GET /.well-known/jwks.json` — public signing keys
- `POST /register` — Dynamic Client Registration (RFC 7591) for MCP clients
- `GET /authorize` — authorization endpoint, requires an operator session and renders approval UI with scope descriptions and a one-shot approval token
- `POST /token` — token endpoint (PKCE code exchange + refresh)
- `POST /revoke` — token revocation
- `GET /setup` — first-boot passkey enrollment (one-shot, disabled after first successful enrollment)
- `POST /webauthn/register/options`, `/webauthn/register/verify` — enrollment ceremony
- `POST /webauthn/auth/options`, `/webauthn/auth/verify` — login ceremony
- `GET|POST /logout` — revoke current operator session, clear session cookie, and redirect to safe relative `return_to`

### First-boot ceremony

1. Brain starts, detects no passkey credentials registered
2. Logs a one-shot setup URL to the console (e.g. `https://brain.example.com/setup?token=<short-lived>`)
3. Operator visits, registers a passkey, optionally registers a backup
4. Setup endpoint disables itself; subsequent `/setup` requests return 404

This avoids exposing an open enrollment endpoint while keeping the bootstrap UX simple.

### Recovery procedure

If all operator passkeys are lost or compromised, SSH into the host and run:

```bash
cd /path/to/brain-instance
brain auth reset-passkeys --yes
```

Use `--storage-dir <dir>` when the auth-service storage path is not the default `./data/auth`. The command clears passkeys, active operator sessions, outstanding authorization codes, and refresh tokens while preserving OAuth clients and signing keys. It refuses to operate under `brain-data`. Restart the brain afterwards; first-boot setup detection will print a new one-shot `/setup` URL.

### MCP transport changes

`interfaces/mcp/src/transports/http-server.ts` now supports OAuth bearer validation alongside the deprecated static `MCP_AUTH_TOKEN` fallback:

- pull the bearer token from the `Authorization` header
- validate against the brain's own JWKS via `AuthService.verifyBearerToken()`
- require the `mcp` scope
- grant anchor permission to authenticated HTTP MCP callers
- on validation failure, return MCP-spec-compatible `WWW-Authenticate` with `resource_metadata` pointing at `/.well-known/oauth-protected-resource`

`/.well-known/oauth-protected-resource` metadata points to the brain's own authorization server, per the latest MCP auth specification.

### CMS/dashboard auth boundary

`plugins/cms` remains a public shell because Sveltia/GitHub already owns CMS write authentication. `plugins/dashboard` also remains a public route, but widgets can opt into `visibility: "operator"`. Public requests only fetch/render public widgets; requests with a valid passkey-backed operator session include both public and operator widgets. When operator widgets are hidden, the dashboard shows an operator sign-in prompt linking to `/login?return_to=<current-dashboard-path>`. For now, only the Publication Pipeline widget opts into operator visibility; the exact widget mix remains a later product decision. Plan 3 deepens write-side CMS behavior.

### Identity flow

```
HTTP request
  → JWT middleware validates bearer token against /.well-known/jwks.json
  → resolves `sub` claim to user entity (or single-operator default)
  → middleware sets `ctx.user` and `ctx.identity`
  → handler calls permissionService.getUserLevel(interface, identity)
  → returns anchor / trusted / public
  → existing tool-filtering and routing continues unchanged
```

The downstream permission machinery does not change. The middleware is the only new integration point.

## Rollout

### Phase 1 — provider package ✅

- created `shell/auth-service`
- generated and persisted ES256 signing keypair in runtime auth storage (`./data/auth`), outside `brain-data`
- published JWKS, authorization-server metadata, protected-resource metadata
- implemented file-backed clients, authorization codes, operator sessions, passkeys, and refresh tokens

### Phase 2 — passkey enrollment + login UI ✅

- minimal HTML/JS pages for `/setup`, `/login`, `/authorize`
- one-shot authorization approval token required before `/authorize` POST issues a code
- authorization approval screen displays requested scope names/descriptions instead of temporary development copy
- WebAuthn ceremonies via `@simplewebauthn/server`
- single-operator mode: first passkey wins, no management UI
- first setup gated by a one-shot setup token

### Phase 3 — JWT verification + MCP transport switch ✅

- access-token verification helpers in `shell/auth-service`
- MCP HTTP transport validates brain-issued OAuth bearer tokens and requires `mcp` scope
- `MCP_AUTH_TOKEN` remains only as a deprecated static fallback
- DCR enabled for MCP clients
- validated with Pi MCP adapter against Rover core (`/mcp-auth rover-brain`, tool discovery, `system_status`, and `a2a_call`)

### Phase 4 — dashboard widget visibility ✅

- kept `/cms` and `/cms/config.yml` public because Sveltia/GitHub already owns CMS auth
- kept `/dashboard` and Rover's `/` dashboard mount public as a dashboard shell
- added widget-level `visibility: "public" | "operator"`, defaulting to `"public"`
- marked only the Publication Pipeline widget as operator-visible for now
- public requests only fetch/render public widgets; operator-session requests include operator widgets
- dashboard displays an operator sign-in prompt when hidden operator widgets exist
- operator sessions can be revoked via `/logout`, and signed-in dashboards show a sign-out link

### Phase 5 — multi-user expansion ⏳

- align with `docs/plans/multi-user.md` rollout: passkey credentials attach to user entities
- add user-management tools (create user, register additional passkey, revoke)
- this phase is co-owned with the multi-user plan

## Resolved decisions

1. Package home is `shell/auth-service`.
2. Refresh tokens persist in runtime auth storage and rotate on use.
3. `/setup` always requires a one-shot setup token until the first credential exists.
4. Runtime auth state lives under `./data/auth` by default, never under `brain-data`.
5. MCP advertises auth through `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"` derived from the request origin.
6. CMS auth remains delegated to Sveltia/GitHub for v1; Brain OAuth does not wrap `/cms`.
7. Dashboard auth is widget-level for v1; Brain OAuth does not wrap the whole dashboard route.
8. Issuer/host validation is strict by default: configured issuer plus configured trusted issuers; localhost/127.0.0.1 is allowed for local-dev issuers.

## Open questions

1. Should the single-operator subject remain `single-operator` until multi-user lands, or should a local user entity be created now as a compatibility bridge?
2. Should API-route execution receive the operator subject instead of the current `webserver` anonymous identity if private API routes are used for future write flows?

## Verification

1. ✅ A fresh brain boots, prints a one-shot setup URL, and accepts a passkey enrollment
2. ✅ Subsequent operator logins via `/authorize` require an operator session/passkey login
3. ✅ Pi MCP adapter completes dynamic client registration and the OAuth code+PKCE flow against the brain
4. ✅ Pi MCP adapter calls `/mcp` with a bearer token issued by the brain and receives normal MCP responses
5. ✅ `MCP_AUTH_TOKEN` env var is no longer required for HTTP MCP when `auth-service` is enabled
6. ✅ `/cms` remains public/delegated to Sveltia/GitHub auth, while dashboard widgets can require an operator session before their data is fetched/rendered
7. ✅ OAuth-authenticated HTTP MCP callers receive anchor permissions and normal tool filtering
8. ✅ JWKS endpoint serves the OAuth signing key today, ready to also carry the A2A signing key when plan 1 lands
9. ✅ Refresh token rotation works across brain restarts/runtime storage
10. ✅ Single-operator mode runs without requiring the multi-user plan to ship first
11. ✅ OAuth issuer/host validation rejects untrusted forwarded hosts while allowing configured preview hosts and local-dev localhost/127.0.0.1

## Related

- `docs/plans/a2a-request-signing.md` — companion plan, shares JWKS endpoint
- `docs/plans/a2a-reliability.md` — timeout/retry/error-surfacing hardening for remote A2A calls
- `docs/plans/cms-heavy-backend.md` — depends on this plan
- `docs/plans/multi-user.md` — co-evolves with this plan
- `docs/plans/cms-on-core.md` — establishes the shared HTTP surface this plan mounts on
- `docs/plans/unified-http-surface.md` — same
