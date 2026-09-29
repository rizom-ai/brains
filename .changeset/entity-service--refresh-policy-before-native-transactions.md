---
"@brains/entity-service": patch
---

Refresh database-backed grouping policy under serialized writer admission before opening native transactions. Keep revision checks inside mutations and projection validation inside transactions without re-entering the root database client, preventing deadlocks while preserving stale-policy refusal and atomic persistence.
