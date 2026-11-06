---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/image": patch
"@brains/image-plugin": patch
"@brains/web-chat": patch
"@brains/directory-sync": patch
---

Store uploaded images as staged assets instead of data URLs. Image entities switch to asset-backed storage and leave full-text search; uploads are staged, then published with the image, and format, media type, size and dimensions come from the bytes (25 MiB limit). Entity reads take a `binaryContent` mode: the default materializes asset references back into data URLs so existing readers keep working, while `"reference"` returns the stored reference. The web chat image route streams stored chunks, and directory sync no longer re-imports an image whose file matches its stored asset. Plugins can stage and open assets through the entity service.
