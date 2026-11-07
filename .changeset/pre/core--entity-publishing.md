---
"@rizom/brain": patch
---

`defineEntity` accepts `publish`, which hands the brain's publish pipeline the type's provider and the metadata fields its result id and timestamp go in, and `publishAssets`, which names images the pipeline renders from the type's attachments before a record goes out. `@rizom/brain/entities` exports `EntityPublishDeclaration`, `EntityPublishAssetDeclaration`, `PublishProvider`, `PublishResult`, `PublishImageData` and `PublishMediaData`.
