---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Serialize auth initialization, lazy startup, invitation recovery startup, and shutdown in admission order. Settle both signing-key loads before rollback, release partially acquired resources on failure, continue cleanup after supervisor errors, and recreate database-bound account settings after restart.
