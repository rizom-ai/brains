---
"@rizom/brain": patch
---

A first-party entity type that keeps each file's own frontmatter order also keeps the record dates and ids a hand-written file states, where the file states them, as an entity plugin class's adapter kept them, so directory sync no longer rewrites such a file to drop its `created` and `updated` lines.
