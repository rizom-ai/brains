---
"@rizom/brain": patch
"@brains/directory-sync": patch
---

Reuse the durable parent projection-batch identity for directory import and cleanup through the declarative SDK's existing child reference. Derive the internal operation identity from its root job ID without restoring caller-supplied source or operation-ID authority. Standalone operations retain independent batches and the coordinator fence remains unchanged.
