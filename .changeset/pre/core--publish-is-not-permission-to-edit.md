---
"@brains/entity-service": patch
"@brains/core": patch
"@brains/content-service": patch
"@brains/studio": patch
"@brains/webdav": patch
"@brains/conflict": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

Permission to publish is no longer permission to edit. A write that moves a record into one of its publish statuses, or writes a record already in one, needed only the `publish` action, so it could change the record's body or other fields on a type whose `update` was refused. Such a write now needs `update` as well when it changes anything besides the status, on every path: `system_update`, a Studio save, a save on the drive, a conflict resolution and a generation over a published destination. A type nobody may update is published as it stands.
