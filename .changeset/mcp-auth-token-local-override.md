---
"@brains/deploy-support": minor
"@rizom/brain": minor
---

`MCP_AUTH_TOKEN` is now a local-only override. Removed from the shared Kamal deploy template, the bundled brain-cli env schemas for rover/ranger/relay, and the rover pilot template. Rover deployments authenticate via OAuth/passkey through `auth-service`; existing operators using `MCP_AUTH_TOKEN` can still set it locally if needed.
