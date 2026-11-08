---
"@rizom/brain": patch
---

A type declared with `defineEntity` is embedded from its stored markdown, frontmatter included, as an entity plugin class's type is, rather than from the body its reads hand back. A converted type keeps the search distances its thresholds were tuned on, such as the wishlist's same-wish distance. Declared types from earlier releases, third-party ones included, were embedded from their body alone; each such record is re-embedded from its stored markdown on its next content change.
