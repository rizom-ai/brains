---
"@brains/db": patch
"@brains/entity-service": patch
---

Carry hierarchy, grouping reads, write snapshots and conditional-write data through validated owner RPC contracts. Keep grouping startup reprojection owner-only, propagate cancellation separately from wire data, and reject runtime callbacks before serialization. Type the database's existing owned `$client` and exercise grouping scale through that owner rather than opening migrated files with another engine.
