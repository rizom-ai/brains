---
"@brains/webdav": patch
"@rizom/brain": patch
---

Connecting the drive from macOS no longer reports "operation not permitted". The hidden folders a desktop makes on a mounted volume (`.Trashes`, `.TemporaryItems`, `.Spotlight-V100`), at the top of the drive or inside any folder, and every file inside them, are temporary items held per person in memory, never entities. A property change (`PROPPATCH`), which macOS and Windows send after a save, is accepted and stores nothing instead of answering 403.
