---
"@rizom/brain": patch
---

The content pipeline reads a published record's cover image, attachments, source and asset fields whichever way the record was read: from the frontmatter of a stored document, or from the metadata of a declared type, which reads back as its body. Before this, a declared record went out without its cover image, and its social card was rendered again on every publish even when it had one.
