---
"@rizom/brain": patch
---

Frontmatter is read the same everywhere: a file whose frontmatter closes with `---` followed by spaces or tabs, or that has an empty frontmatter block, now publishes and queues with its status and publish date, finds its cover and OG images, and decodes as an image file. Before, these steps treated such a file as having no frontmatter.
