---
"@rizom/brain": patch
---

A first-party service reads the auth backend the brain bound through its internal runtime, when it asks, as its class read `context.auth.get()`; a brain without auth-service has none.
