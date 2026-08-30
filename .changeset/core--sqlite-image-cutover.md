---
"@brains/atproto-contracts": patch
"@brains/blog": patch
"@brains/chat": patch
"@brains/content-pipeline": patch
"@brains/directory-sync": patch
"@brains/entity-service": patch
"@brains/image": patch
"@brains/image-plugin": patch
"@brains/media-page-composer": patch
"@brains/plugins": patch
"@brains/site-builder-plugin": patch
"@brains/site-engine": patch
"@brains/social-media": patch
"@brains/stock-photo": patch
"@brains/test-utils": patch
"@brains/web-chat": patch
---

Store newly completed images as transaction-bound SQLite assets, keep existing inline image entities readable during the controlled migration window, and explicitly resolve bytes across chat, site builds, directory sync, media composition, ATProto, and publishing consumers. Pending images no longer persist placeholder payloads, and ordinary image data remains excluded from FTS and entity-list reads. This change does not bulk-migrate existing inline images.
