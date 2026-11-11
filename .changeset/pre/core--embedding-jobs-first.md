---
"@rizom/brain": patch
"@brains/entity-service": patch
---

Embedding jobs are claimed ahead of default-priority jobs, so slow derivations such as FAQ or topic passes no longer hold the search index, and with it chat, behind them.
