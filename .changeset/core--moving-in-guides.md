---
"@brains/guide": patch
"@rizom/brain": patch
---

Brains can carry moving-in guides: a `guides` plugin with a `guide` entity type for walkthroughs addressed to one kind of user. A guide's frontmatter names who it is for, the recipe it starts from, optionally what it uses from that recipe (`brings`, shown in place of the recipe's own lines), and the material that user already has with what each part becomes; its body is markdown, one `##` stage per heading. Guides render inside the docs chrome at `/guides/<slug>`, with an index of every guide at `/guides`; the docs header links to it. The plugin also offers `guides:guide-band`, the guides as a band for a docs page composed of sections, and the docs plugin offers the docs home in two parts (`docs:doc-home-hero`, `docs:doc-home-sections`) so a site can set such a band between them. The plugin is off by default; a brain adds it with `add: [guides]`.
