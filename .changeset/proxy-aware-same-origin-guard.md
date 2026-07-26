---
"@brains/auth-service": patch
"@brains/admin": patch
---

Fix admin and account mutations behind the TLS-terminating proxy. The same-origin guard now compares the browser Origin against the forwarded origin (x-forwarded-proto/host) instead of the internal http hop, which rejected every deployed POST with 403. Mutation error toasts also stack above the modal layer, so failures inside dialogs are visible instead of silently hidden.
