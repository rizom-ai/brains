---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@brains/core": patch
"@brains/image": patch
"@brains/blog": patch
"@brains/series": patch
"@brains/chat": patch
"@brains/content-pipeline": patch
"@brains/site-builder-plugin": patch
"@brains/studio": patch
"@brains/site-engine": patch
"@brains/media-page-composer": patch
"@brains/directory-sync": patch
---

Image readers read stored references and load bytes explicitly, only for a record read at the caller's scope. Chat delivery, the Studio preview, the ATProto and social cover, site image preparation, OG composition and entity-reference expansion read the image's reference and then its bytes; a restricted image is never served through another image that shares its bytes. Studio previews stream from storage into object URLs, and its image field offers only PNG, JPEG, GIF and WebP. System reads, listings and insights that mask or ignore content no longer load image bytes.

Directory sync exports an asset-backed image by streaming its chunks to a temporary file renamed into place, and leaves a file that already holds those bytes untouched. A markdown image file stays the image's only file: left byte for byte when it decodes to the stored bytes, rewritten as a data URL only when they change. An image awaiting its bytes writes no file, and content that is not a base64 data URL is refused instead of being decoded into a corrupt file.
