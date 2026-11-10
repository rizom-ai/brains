---
"@rizom/brain": patch
---

A job declared with `defineEntityJob({ input, handle })` writes the records of the type that declares it: its `handle` is given an `EntityJobHandleContext`, whose `entities` adds a service slot's `OwnedEntityWriter` (`create`, and `update` and `delete` of a record as it was read) to the job's reads. It writes as the job reads: as its requester, held to the type's action policy and the visibility they may write, or as the package when the package queued the job. A write to any other type is refused. A generation's context still reads only.
