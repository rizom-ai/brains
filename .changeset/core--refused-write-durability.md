---
"@rizom/brain": patch
---

A local database write refused by a briefly held lock no longer leaves its connection inside an uncommitted transaction. Before, the retried write and every later write on that connection looked applied to the brain itself but were never committed, and vanished when the connection reopened — import jobs completed, then ran again against a closed projection batch and failed.
