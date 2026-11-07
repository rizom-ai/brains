---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A generation's `linkInto` on a declared target is refused before anything is saved when the target's metadata does not declare the linked field or list, or cannot hold the link. A declared type's metadata is its frontmatter, so such a link was stored where no read reached it.
