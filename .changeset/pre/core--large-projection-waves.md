---
"@rizom/brain": patch
---

A projection wave larger than SQLite can bind in one statement is claimed and requeued in chunks. Before, a change touching several thousand entities at once — a corpus migration, a bulk import — failed every coordination sweep with "too many SQL variables", and no projection or automatic site rebuild ran again.
