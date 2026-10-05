---
"@brains/image": patch
"@brains/directory-sync": patch
---

Directory sync imports image files without ever holding them whole. An unchanged file is recognised by hashing it as a stream; a changed one is described from its header bytes and staged straight from a file stream, so a 20 MiB import no longer stalls the event loop. Files that are not a PNG, JPEG, GIF or WebP image are reported and left in place. `describeImageBytes` in `@brains/image` reads an image's format, media type and dimensions from its header.
