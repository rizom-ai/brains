---
"@rizom/brain": patch
---

`defineEntity` accepts `atproto`, which publishes the type's public records to AT Protocol through the brain's AT Protocol projection registry: a lexicon that names the collection, an optional `isPublishable`, and `buildRecord`, given the validated record, reads as the package and `uploadBlob`. `@rizom/brain/entities` exports `EntityAtprotoProjection`, `EntityAtprotoRecordInput`, `EntityAtprotoPublishConfig`, `AtprotoLexicon` and `AtprotoBlobRef`.
