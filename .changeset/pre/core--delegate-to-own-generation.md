---
"@rizom/brain": patch
---

A declared entity type's create route can delegate to the type's own generation by naming `generation`: the runtime queues it as the type's `{type}:generation` job for the caller who asked, filling the placeholder an allocation writes or, with nothing allocated, writing a new record. A type can no longer declare a job named `generation`.
