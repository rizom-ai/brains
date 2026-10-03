---
"@brains/image": patch
"@brains/image-plugin": patch
"@brains/stock-photo": patch
"@brains/directory-sync": patch
---

Every image writer now stores staged assets instead of data URLs: AI-generated, source-rendered and OG images, stock photos, directory-sync cover and inline image conversions, and image files imported by directory sync. A shared `stageImageEntity` helper checks the format before staging and derives format, media type, size and dimensions from the bytes; provider data URLs are decoded while staging and never persisted. Directory sync gains `maxAssetImportBytes` (25 MiB by default) for files of asset-backed types, while `maxImportFileBytes` keeps bounding text and inline binary imports. Deduplication lookups read asset references instead of loading image bytes.
