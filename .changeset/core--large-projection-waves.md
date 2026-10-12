---
"@rizom/brain": patch
---

A projection wave larger than SQLite can bind in one statement is claimed and requeued in chunks. Before, a change touching several thousand entities at once — a corpus migration, a bulk import — failed every coordination sweep with "too many SQL variables", and no projection or automatic site rebuild ran again.

Chunks remain inside the existing transaction: a later insert failure rolls back the earlier chunks and the wave transition. Newer pending ingress is preserved on failure or supersession. This bounds each insert statement, not the full journal scan, memory use, transaction duration, or shutdown time.
