---
"@rizom/brain": minor
"@rizom/ops": patch
---

Add the embedded Brain OAuth/passkey provider for MCP HTTP and operator sessions.

Rover now includes `auth-service` by default, serves OAuth discovery/JWKS/protected-resource metadata, supports dynamic client registration and PKCE authorization-code flow, persists signing keys/clients/codes/sessions/passkeys/refresh tokens under runtime auth storage, and lets OAuth-capable MCP clients authenticate through browser/passkey login with the `mcp` scope.

`MCP_AUTH_TOKEN` remains available as a deprecated static fallback. The CLI adds `brain auth reset-passkeys --yes` for local break-glass passkey recovery, onboarding docs now cover first-run `/setup`, and generated deploy templates persist `/app/data` so `./data/auth` survives redeploys outside `brain-data`.
