---
"@brains/auth-service": patch
---

Remove obsolete auth compatibility paths now that released database auth begins with generated Drizzle migrations and file-store sessions are intentionally not imported. Reject the retired browser cookie and `single-operator` subject, remove deprecated identity projections, and fail closed for unreleased pre-Drizzle development databases.
