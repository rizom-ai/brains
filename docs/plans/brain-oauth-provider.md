# Plan: Brain OAuth Provider

## Status

Proposed. First plan in the integrated-auth sequence (this → A2A request signing → CMS heavy backend).

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

- `oidc-provider` (Filip Skokan) for the OAuth/OIDC core
- `@simplewebauthn/server` for passkey enrollment and authentication
- `jose` for JWT validation in middleware

These are mature, audited, widely deployed. The brain's job is configuration, persistence, and UI — not protocol implementation.

### 3. Passkey-only for operator login in v1

WebAuthn / passkeys are the only operator authentication mechanism initially. No password fallback, no magic links. Reasons:

- one mechanism is simpler to harden than several
- passkeys cover device-bound (Touch ID, Windows Hello) and roaming (YubiKey) without code changes
- operators are typically one or a small handful of people; the recovery story is "register a backup passkey"

Recovery from total credential loss is a manual brain-side reset (operator ssh's in, runs a CLI command). Acceptable for the self-hosted scale.

### 4. JWT validation as shared middleware

A single Hono middleware module validates JWTs and attaches the verified identity (and the brain user record it resolves to) to the request context. Used by:

- MCP transport (replaces the current token compare)
- CMS routes (`/cms`, `/cms/config.yml`)
- future operator-facing routes

The middleware is the integration point with `permissionService`.

### 5. Integration with the multi-user plan

User entities (per `docs/plans/multi-user.md`) are the durable identity. OAuth subjects map to user entities. Passkey credentials attach to user entities. The provider is the authentication mechanism; the user entity is the authenticated principal. The two plans are co-evolving — this plan assumes the user-entity model lands alongside it or shortly after.

If user entities are not yet ready, v1 supports a single-operator mode (one user record, one passkey, no management UI) consistent with the multi-user plan's "single-owner path must continue to work" requirement.

### 6. Package home

A new package at `shell/auth-service`. Owns:

- provider configuration and lifecycle
- passkey enrollment and authentication endpoints
- JWT validation middleware
- signing key custody (separate from the A2A signing key)
- DCR-aware client storage

Mounted on the shared HTTP surface (`interfaces/webserver`) per `docs/plans/cms-on-core.md` direction.

## Design

### Provider configuration

- Issuer = `https://<brain-domain>` (production) or `http://localhost:<port>` (dev)
- Signing keys: ES256 keypair generated on first boot, persisted in runtime auth storage outside `brain-data` (default `./data/auth`, `0600` perms)
- JWKS published at `/.well-known/jwks.json` (shared endpoint, also serves the A2A signing key when plan 1 lands)
- Authorization-server metadata at `/.well-known/oauth-authorization-server`
- Token lifetimes: short-lived access tokens (15 min), longer refresh tokens (30 days, rotating)

### Endpoints

- `GET /.well-known/oauth-authorization-server` — provider metadata
- `GET /.well-known/jwks.json` — public signing keys
- `POST /register` — Dynamic Client Registration (RFC 7591) for MCP clients
- `GET /authorize` — authorization endpoint, renders passkey prompt
- `POST /token` — token endpoint (PKCE code exchange + refresh)
- `POST /revoke` — token revocation
- `GET /setup` — first-boot passkey enrollment (one-shot, disabled after first successful enrollment)
- `POST /webauthn/register/options`, `/webauthn/register/verify` — enrollment ceremony
- `POST /webauthn/auth/options`, `/webauthn/auth/verify` — login ceremony

### First-boot ceremony

1. Brain starts, detects no passkey credentials registered
2. Logs a one-shot setup URL to the console (e.g. `https://brain.example.com/setup?token=<short-lived>`)
3. Operator visits, registers a passkey, optionally registers a backup
4. Setup endpoint disables itself; subsequent `/setup` requests return 404

This avoids exposing an open enrollment endpoint while keeping the bootstrap UX simple.

### MCP transport changes

`interfaces/mcp/src/transports/http-server.ts:126-157` — replace the `authenticate()` token compare with JWT validation:

- pull the bearer token from the `Authorization` header
- validate against the brain's own JWKS via the shared middleware
- attach the resolved user identity to the request
- on validation failure, return MCP-spec-compliant 401 with `WWW-Authenticate` pointing at the authorization server

Add `/.well-known/oauth-protected-resource` metadata pointing to the brain's own authorization server, per the latest MCP auth specification.

### CMS gate

`plugins/admin` (per `cms-on-core.md`) registers its routes as protected. `/cms` and `/cms/config.yml` go behind the same JWT middleware. The Sveltia → GitHub flow is unchanged in this plan; only the admin-shell visibility gates on operator login. Plan 3 deepens this.

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

### Phase 1 — provider package

- create `shell/auth-service`
- wire `oidc-provider` with file-backed adapter (sqlite or filesystem) for clients, grants, sessions
- generate and persist signing keypair on first boot
- publish JWKS and authorization-server metadata
- no UI yet; all flows return JSON

### Phase 2 — passkey enrollment + login UI

- minimal HTML/JS pages for `/setup`, `/authorize`
- WebAuthn ceremonies via `@simplewebauthn/server`
- single-operator mode: first passkey wins, no management UI

### Phase 3 — JWT middleware + MCP transport switch

- shared middleware in `shell/auth-service`
- MCP transport drops `MCP_AUTH_TOKEN` path, uses middleware
- `MCP_AUTH_TOKEN` env var marked deprecated; provider issues all MCP tokens
- DCR enabled for MCP clients; verify Claude Desktop end-to-end

### Phase 4 — CMS gate

- `plugins/admin` mounts behind the middleware
- Sveltia → GitHub flow unchanged; only the shell-page visibility gates
- verify operator can edit content with a single passkey login

### Phase 5 — multi-user expansion

- align with `docs/plans/multi-user.md` rollout: passkey credentials attach to user entities
- add user-management tools (create user, register additional passkey, revoke)
- this phase is co-owned with the multi-user plan

## Open questions

1. Should the provider package live at `shell/auth-service` or `shell/oauth-provider`? `auth-service` is broader and could absorb future auth concerns; `oauth-provider` is narrower and clearer.
2. Should refresh tokens persist across brain restarts (via the file-backed adapter) or be ephemeral? Persistent is more user-friendly; ephemeral simplifies revocation.
3. Should `/setup` be reachable only from localhost in dev, or always require the one-shot token? One-shot token works in both cases and is simpler.
4. How should the MCP transport advertise the authorization server when the brain is reachable at multiple domains (preview + production)? Probably: read from request `Host` header.
5. Does the dashboard at `/` need to be gated too, or only `/cms`? Likely yes for operator-only views, but check `plugins/dashboard` first.

## Verification

1. A fresh brain boots, prints a one-shot setup URL, and accepts a passkey enrollment
2. Subsequent operator logins via `/authorize` succeed with passkey, fail without
3. Claude Desktop completes dynamic client registration and the OAuth code+PKCE flow against the brain
4. Claude Desktop calls `/mcp` with a bearer token issued by the brain and receives normal MCP responses
5. `MCP_AUTH_TOKEN` env var is no longer required for HTTP MCP
6. `/cms` and `/cms/config.yml` return 401 for unauthenticated browsers; serve normally after operator login
7. JWT middleware resolves identity into `permissionService` and tool filtering still works
8. JWKS endpoint serves the OAuth signing key today, ready to also carry the A2A signing key when plan 1 lands
9. Refresh token rotation works across brain restarts
10. Single-operator mode runs without requiring the multi-user plan to ship first

## Related

- `docs/plans/a2a-request-signing.md` — companion plan, shares JWKS endpoint
- `docs/plans/cms-heavy-backend.md` — depends on this plan
- `docs/plans/multi-user.md` — co-evolves with this plan
- `docs/plans/cms-on-core.md` — establishes the shared HTTP surface this plan mounts on
- `docs/plans/unified-http-surface.md` — same
