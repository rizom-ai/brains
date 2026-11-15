---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@brains/core": patch
"@brains/app": patch
"@brains/ai-evaluation": patch
"@brains/image": patch
"@brains/image-plugin": patch
"@brains/blog": patch
"@brains/web-chat": patch
"@brains/directory-sync": patch
---

Store uploaded images as staged assets instead of data URLs. Image entities switch to asset-backed storage and leave full-text search; an upload is staged, then published with its image, and its format, media type, size and dimensions come from the bytes (25 MiB limit). A pending or failed image holds no payload. Only PNG, JPEG, GIF and WebP uploads become images.

Entity reads take a `binaryContent` mode: the default materializes an asset reference back into the data URL inline storage returned, counted by read surface and entity type, while `"reference"` returns the stored reference. Updates and deletes through the system tools, and owned writes, read the stored reference, so they never write bytes back inline. The web chat image route reads the image at the caller's scope and streams only that image's stored chunks, and directory sync no longer re-imports an image whose file matches its stored asset.
