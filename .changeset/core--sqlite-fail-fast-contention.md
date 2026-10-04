---
"@brains/db": patch
"@brains/auth-service": patch
"@brains/entity-service": patch
---

Disable native SQLite busy waiting on application-thread connections, including local auth replicas. Retry refused BEGIN acquisition asynchronously for non-replica local clients within a two-second budget, covering auth, conversation and entity transactions without replaying callbacks or commits. Reset only refused local BEGIN connections so libSQL's retained failed statements cannot poison a later commit. Embedded replicas retain SDK-owned transaction acquisition and reconnect behavior. Route formerly unguarded export acknowledgements and projection-rule scheduling writes through BEGIN-only transaction retries, avoiding libSQL's retained stale snapshots after refused implicit writes. Preserve foreign keys, FULL synchronization, automatic checkpoints and replica configuration.
