---
"@rizom/brain": patch
---

`brain assets:migrate` and `brain assets:reconcile` fold their write-ahead log into the database and truncate it before they close, so the database file holds every write when the command exits.
