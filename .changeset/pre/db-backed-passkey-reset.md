---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Make `brain auth reset-passkeys --yes` atomically clear passkeys, WebAuthn challenges, sessions, authorization codes, refresh tokens, and global setup links from `auth.db` while preserving users, OAuth clients, signing keys, and untouched legacy backup files.
