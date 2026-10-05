---
"@brains/assets": patch
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/image": patch
"@brains/media-page-composer": patch
"@brains/site-engine": patch
"@brains/site-builder-plugin": patch
"@brains/core": patch
"@brains/series": patch
"@brains/social-media": patch
---

Render paths read images by reference and encode bytes only where they render. The site image build, cover image enrichment, image resolution, media page attachments and `entity://image` expansion read asset-backed images explicitly through `readImageBytes` and `imageDataUrl`; insights, entity read tools, resource templates and series membership lookups (projection, datasource, manager and generation) no longer load binary content they never use. `readAssetBytes` and `AssetOpener` are shared from `@brains/assets` and re-exported through the entity service and plugins.
