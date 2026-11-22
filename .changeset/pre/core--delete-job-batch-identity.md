---
"@rizom/brain": patch
---

A delete job of a durable sync that finds the record still held by another of its files, such as a `.md` moved to its `.yaml`, imports that file within the sync's own batch. It opened a second batch the sync's refused ("cannot join active batch"), and the job failed.
