---
"@brains/auth-service": minor
"@rizom/brain": minor
"@rizom/ops": minor
---

Breaking: `auth-service.setupEmail` now takes only the recipient address. The `{ to, subject, body }` form and its `{{setupUrl}}`, `{{expiresAt}}` and `{{origin}}` placeholders are removed; a brain.yaml that still uses them fails config validation. Regenerate pilot brain.yaml files with `brains-ops reconcile` before pinning this release.

The anchor setup email is now built in: a text and an HTML part that say the brain is ready, explain passkeys, print the expiry as a readable UTC date, and point to the dashboard, chat, Studio and the MCP endpoint. brains-ops no longer writes Rover-specific setup email copy.
