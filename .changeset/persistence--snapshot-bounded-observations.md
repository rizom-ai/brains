---
"@brains/entity-service": patch
"@brains/job-queue": patch
---

Read pending/claimed projection inputs, batch children and durable job updates through bounded native SQL results within owner-side transaction snapshots. Size metadata pages before retrieving full records and batch projection recovery inserts. Preserve latest-input coalescing, newer ingress, atomic wave recovery and composite job cursor ordering without increasing SQL or RPC allowances.
