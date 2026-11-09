---
"@rizom/brain": patch
---

A brain running in production now refuses the static MCP bearer token (`plugins.mcp.authToken` / `MCP_AUTH_TOKEN`) at boot; the token is for local development only, so connect deployed brains through OAuth with passkeys.
