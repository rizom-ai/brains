---
"@brains/auth-service": minor
"@rizom/brain": minor
"@rizom/ops": minor
---

Breaking: `auth-service.setupEmail` now takes only the recipient address. The `{ to, subject, body }` form and its `{{setupUrl}}`, `{{expiresAt}}` and `{{origin}}` placeholders are removed; a brain.yaml that still uses them fails config validation. Regenerate pilot brain.yaml files with `brains-ops reconcile` before pinning this release.

The anchor setup email and the invitation now share one onboarding body after their own opening: a first save-and-ask in chat, Studio, and how to connect AI tools over MCP (the brain's `/mcp` address, the Claude Code command, Claude Desktop custom connectors, OAuth sign-in with the passkey). Both have text and HTML parts. brains-ops no longer writes Rover-specific setup email copy.
