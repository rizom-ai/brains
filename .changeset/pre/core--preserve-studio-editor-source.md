---
"@brains/studio": patch
"@rizom/brain": patch
---

Read raw source for Studio editing and mutation preparation so image-like grouping values, unclaimed frontmatter and body references cannot be rewritten by presentation-time image expansion.

Resolve Markdown preview images separately through an authenticated, visibility-scoped image read. Use the injected client, cancel superseded requests and discard previously authorized image data when the client/session changes. Preserve literal code examples and existing Markdown sanitization. Cover exact Note/Post source round trips, mounted preview-and-save behavior, opaque image IDs and restricted-image non-disclosure.
