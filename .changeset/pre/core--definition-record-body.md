---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A definition-typed record is read as stored: its body decoded by the type's codec, with image references left as `entity://image/{id}` references instead of resolved to the image's data. `EntityReader.get` used to resolve them while `list` did not, so the two returned different content for one record, and a record read and written back, through an Inbox action, a create route's update or a service's owned writes, could store the image's data in place of its reference. A record written back unchanged is now stored byte for byte. A generation's `linkInto` on a declared target now reads and writes the target's metadata, which is its frontmatter, instead of the body, so extending a list keeps the entries already on it. The read-only entity service that analytics reports are given gains `getEntityRaw`.
