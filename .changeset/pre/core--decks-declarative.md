---
"@rizom/brain": patch
---

The decks are a declarative entity package, composed under their plugin id `decks`, with the same templates, data source, `deck:generation` job, attachments, publish registration and AT Protocol records. A deck reads back as its slides, its frontmatter its metadata, and is stored, imported and exported byte for byte as before. Two readers move with it: a site reading a deck takes its frontmatter from its metadata, and a social post written from a deck or a post now names the source's title on its own line above the source's body, in place of the source's raw frontmatter.
