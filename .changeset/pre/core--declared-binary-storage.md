---
"@rizom/brain": patch
---

A type declared with `defineEntity` and `binaryStorage` keeps binary content as it is: its content is stored unchanged with no frontmatter, its metadata lives beside it and is not re-derived from the content at startup, and its `markdown` codec needs only `decode`, which returns what the bytes say for an import to merge with the metadata handed beside the file. Such a type declares no `coverImage`. A codec's `decode` may return partial metadata for a binary type, and a text type's codec may leave out `encode` to write its metadata as its frontmatter.
