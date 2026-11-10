---
"@rizom/brain": patch
---

`system_update` now reads a grouping or other frontmatter-extension field on a declared type, such as a doc or a wish, from the type's stored document. The confirmation shows the stored value, and the update keeps every other field the document carries. Before, the confirmation showed the stored value as absent and the update dropped the document's other grouping fields.
