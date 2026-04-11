---
"@rizom/brain": patch
---

Improve deploy secret bootstrap ergonomics for standalone repos.

- add `brain ssh-key:bootstrap` to create or reuse a local deploy key, register the matching public key in Hetzner, and optionally push `KAMAL_SSH_PRIVATE_KEY` to GitHub
- make `brain secrets:push` read file-backed secrets from `.env.local` and `.env`, including `~/...` home-directory paths
- document the preferred reproducible contract for `KAMAL_SSH_PRIVATE_KEY_FILE`
