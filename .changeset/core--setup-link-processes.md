---
"@brains/auth-service": patch
---

The first-passkey setup link works in a multi-process runtime. The worker no longer issues a setup token at startup, which replaced the token whose link the web process had just logged, and the Admin setup-link tool no longer hands out a token another process has replaced: it issues a fresh one instead.
