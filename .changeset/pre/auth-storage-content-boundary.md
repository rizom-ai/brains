---
"@brains/auth-service": patch
---

Keep the default auth database under `./data/auth` instead of the synchronized `brain-data` content tree, preventing directory sync from deleting live passkey and session storage.
