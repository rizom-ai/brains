---
"@rizom/brain": patch
---

A contained entity's file outside its container's folder (a book section under `book-section/<book>/…` instead of `book/<book>/…`) moves to its container's folder on import, so cleanup keeps the entity instead of deleting it on every boot. When that path already holds a file, the misplaced file stays where it is, unimported, with a placement warning naming both paths.
