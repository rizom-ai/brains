---
"@brains/auth-service": minor
---

Add the auth runtime database foundation, private auth schema, user/identity store, shell dataDir-backed default storage, database-owned signing keys, first-passkey Admin creation, and session/bearer/identity principal resolution APIs. Legacy JSON/JWK stores are left untouched as optional manual backups and are not imported; existing file-store installations re-onboard once.
