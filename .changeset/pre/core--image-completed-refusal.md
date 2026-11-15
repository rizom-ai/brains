---
"@brains/image": patch
"@brains/image-plugin": patch
---

A completed image without its format, width or height is refused with the same issues as before images were assets. A direct image create with a data URL in its content, as `system_create` makes one, is refused and stores nothing.
