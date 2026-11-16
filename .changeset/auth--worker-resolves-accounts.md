---
"@rizom/brain": patch
"@brains/auth-service": patch
---

A job started by a signed-in person runs again in a brain with a separate worker. Since the typed bus contracts landed, the auth service answered `auth:principal:resolve` in the web process only, so the worker could not resolve the requester's account and refused every such job with "The requester is not permitted": a generation approved in chat or Studio failed after its confirmation. The auth service answers it in every process.
