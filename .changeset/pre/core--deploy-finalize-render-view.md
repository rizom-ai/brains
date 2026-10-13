---
"@rizom/ops": patch
---

Deploy finalize no longer conflicts when another deploy lands first: it carries only the generated `users/` config across the reset to the latest main and renders `views/users.md` there, instead of 3-way merging a stale copy of the generated view.
