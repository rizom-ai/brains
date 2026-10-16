---
"@rizom/brain": patch
---

A site can render an entity type's pages with a template of its choosing through `entityDisplay.<type>.detailTemplate`. The books site renders topics as theme pages: the theme's summary, a strand showing how many sections of each book stand close to it by year, and its closest passages, all found by stored embeddings without API calls. A section split across several entries counts once. Plugins share one related-entries lookup over stored embeddings, `findRelatedEntities`. Detail pages fall back to the title in an entry's frontmatter before naming it by type and slug. Book pages count one book or section in the singular.
