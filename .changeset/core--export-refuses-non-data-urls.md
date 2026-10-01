---
"@brains/directory-sync": patch
---

Directory sync exports an image or document whose data URL ends in a newline or wraps its payload as the bytes it holds. Before, such content failed the data-URL match and the whole data URL was decoded as base64, writing a corrupt file that the next import stored back. Content that is not a base64 data URL is now refused instead of written.
