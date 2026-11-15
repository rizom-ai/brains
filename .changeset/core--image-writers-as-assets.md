---
"@brains/plugins": patch
"@brains/sdk": patch
"@brains/image-plugin": patch
"@brains/stock-photo": patch
"@brains/directory-sync": patch
---

Every image writer stores a staged asset instead of a data URL. Generated images decode the provider's data URL while staging and never store it; source and OG renders, selected stock photos and the images directory sync fetches for covers and inline links are staged from their bytes. Lookups that only need an image's id or status read stored references instead of loading bytes.

Directory sync imports an image file of an asset-backed type from a file stream: it hashes the file, describes it from its header and stages it, under a new `maxAssetImportBytes` limit (25 MiB by default). A file whose bytes match the stored image is skipped, whether the row holds an asset or still an inline data URL, so an unmigrated row waits for the offline migration. A markdown image file, which holds its data URL as text, is decoded and staged the same way, and skipped when it decodes to the stored bytes. A stale sibling file is skipped when another file of the image holds the stored bytes, instead of replacing it. A file that is not a PNG, JPEG, GIF or WebP is reported and left in place, with a hint to rasterize an SVG.
