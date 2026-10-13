---
"@brains/atproto": patch
---

Serialize ambient publishing tasks per record key. `publish:completed` and
`entity:updated` both fire for one mutation and previously raced concurrent
upserts; worse, a delete for an entity turned private could complete while a
slow upsert was still in flight, resurrecting the public record on the PDS.
Tasks sharing an entity key now run in event order; distinct entities still
publish concurrently.
