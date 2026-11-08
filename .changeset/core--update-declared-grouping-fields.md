---
"@rizom/brain": patch
---

`system_update` now reads a grouping or other frontmatter-extension field on a declared type from the type's stored document. The confirmation shows the stored value, and the update keeps every other field the document carries. Before, the update showed the value as absent and dropped the document's other grouping fields, as soon as a declared type, such as a note, was grouped.
