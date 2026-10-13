---
"@brains/auth-service": patch
---

One revoke query in the session store, and a camelCase session record.

Five revoke methods each wrote out the same
`update().set({revokedAt}).where(and(...)).returning()` body, differing only in
the predicate; they now share one helper, making the difference between the
confusingly-named "active" and plain variants visible as a single
`gt(expiresAt, …)` predicate. `AuthSessionRecord` also drops its legacy
snake_case row shape (`token_hash`, `created_at`, `expires_at`) and the
`token_hash` twin of `id` — consumers already read `id` and `subject`, and the
mapped fields are camelCase like every other record in the package.
