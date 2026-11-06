---
"@rizom/brain": patch
"@brains/entity-service": patch
"@brains/image": patch
---

`brain assets:migrate` moves inline images into durable assets while the app is stopped. It brings the entity schema forward, refuses while any image is blocked, then migrates one row at a time: the bytes are staged in committed chunks and published together with the row's new reference, binary metadata and content hash, and the row's full-text entry is removed. Identity, visibility and timestamps are kept, a rerun skips migrated rows, and each run is appended to a manifest (`--manifest`, default `binary-asset-migration.json` beside the database) that records ids, hashes, digests, media types, sizes and outcomes but never bytes.
