---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/directory-sync": patch
---

An entity type can declare `contentRepo: false` when its records must never leave the database. No file write is queued for such a record, directory sync writes it no file and reads no file as one, and its having no file is never taken as a deletion.
