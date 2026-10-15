---
"@rizom/brain": patch
---

Site builds stay linear in a brain's size: the entity store indexes entities by type and slug, so a page finds its entity and a section's themes without reading the whole store. A book's section page carries only what it shows, so a build of a large book brain holds the text once.
