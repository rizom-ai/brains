---
"@rizom/ops": patch
---

Merge existing encrypted per-user secrets during `brains-ops secrets:encrypt` so adding a new secret no longer requires re-entering unchanged secret values such as an existing Discord bot token.
