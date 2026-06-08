---
"@brains/deploy-support": patch
"@brains/rover": patch
"@rizom/brain": patch
"@rizom/ops": patch
---

Release ATProto smoke credential wiring after the previous alpha version bump: Rover reads the app password from `ATPROTO_APP_PASSWORD`, rover-pilot user config owns the public ATProto identifier, and ops encrypts/deploys only the per-user ATProto app password.
