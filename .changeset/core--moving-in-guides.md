---
"@brains/guide": patch
"@rizom/brain": patch
---

Brains can carry moving-in guides: a `guides` plugin with a `guide` entity type for walkthroughs addressed to one kind of user. A guide's frontmatter names who it is for, the recipe it starts from and the material that user already has with what each part becomes; its body is markdown, one `##` stage per heading. Guides render inside the docs chrome at `/guides/<slug>`. The plugin is off by default; a brain adds it with `add: [guides]`.
