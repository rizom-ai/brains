---
"@brains/auth-service": patch
"@brains/db": patch
"@rizom/brain": patch
---

A bundled module finds its migrations in the bundle's `dist/migrations` whether it is an entry or a shared chunk below `dist`, where a chunk used to look for them in `dist/chunks/migrations`. The auth service resolves its migrations the same way as every other store.
