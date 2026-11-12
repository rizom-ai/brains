---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A service declares the entity types it owns in its header's `entities`, and each is installed with the package. The `jobs` and `tools` slots are given one `entities`: definition-typed reads (`EntityReader`) and writes to the owned types (`OwnedEntityWriter`: `create`, `update` and `delete`), both exported from `@rizom/brain/services`. It acts as the current caller: the tool's caller inside a tool, the job's requester inside a running job, and the package's own grant anywhere else. Writes are attributed to that caller and held to the type's action policy at its permission level; a `never` rule closes a type to system tools, not to its owner. A definition the header does not own is refused by the types and at runtime, an id taken at any visibility is refused, and an update or delete of a record the caller cannot see, or one that changed after it was read, is refused. A job handler's context no longer carries an `entities` reader of its own.
