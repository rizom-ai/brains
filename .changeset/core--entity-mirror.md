---
"@brains/plugins": minor
"@brains/sdk": minor
---

Add `entityMirror` to the declared service setup context: the brain's records as a filesystem mirror keeps them.

A package's own writes are scoped to the types it declares, and a mirror declares none and writes every one: an import parses a file through the type's own adapter and stores what it says, an export serialises whatever changed. `entityMirror` is the third admitted cross-type write path after `createRouted` (a type's own route) and `operatorEntities` (a person, policy-checked); here the file is the record and the check is the content hash, not a permission. It carries the reads and writes a mirror makes across every type, serialisation through each type's adapter, `runBulkMutation`, the durable export ledger the mirror drains, and the bulk coordination its sweeps run under.

Named consumer: @brains/directory-sync.
