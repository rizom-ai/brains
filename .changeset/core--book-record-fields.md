---
"@brains/plugins": patch
"@brains/book": patch
"@rizom/brain": patch
---

A book's ATProto record carries its author, year, kind, edition, license, attribution and source, read from the book file's header, and leaves out what the header does not state. A projection's `buildRecord` can ask for the entity's stored document with `storedDocument()`, for a type whose file states more than its metadata indexes.
