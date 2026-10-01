---
"@brains/db": patch
"@brains/auth-service": patch
"@brains/entity-service": patch
---

Disable native SQLite busy waiting on application-thread connections, including local auth replicas. Retry entity transaction acquisition asynchronously within the existing budget, never replaying a started callback or a commit. Reset only refused local BEGIN connections so libSQL's retained failed statements cannot poison a later commit. Preserve foreign keys, FULL synchronization, automatic checkpoints and remote replica configuration.
