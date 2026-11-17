---
"@rizom/brain": patch
"@brains/sdk": patch
"@brains/plugins": patch
"@brains/entity-service": patch
---

`EntityReader.readBytes(definition, id)` reads the bytes of a record of a type that declares `binaryStorage`, through the record the reader can see: an `EntityBytes` of `bytes`, `mediaType` and `sizeBytes`, or `null` when the record is not visible to the reader or holds no bytes yet. A type without `binaryStorage` is refused with `invalid_input`. `EntityBytes` is stable in `@rizom/brain/entities`. An asset-backed record's `content` is the opaque `asset://sha256/<hex>` reference to its bytes; until the data-URL compatibility is removed, reads still return a data URL in its place.
