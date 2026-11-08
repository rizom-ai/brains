---
"@rizom/brain": patch
---

At startup, a brain re-derives the stored metadata of every type declared with `defineEntity` from that type's stored markdown, before startup content settles. A type converted from an entity plugin class kept its fields in its content and stored other metadata, while the declaration reads its frontmatter as metadata, so such rows would read empty or not at all. Only the metadata column is written: content, its hash and `updated` stay, so nothing is exported, re-imported or re-embedded, and a second start writes nothing. A row whose markdown does not decode is logged and left as it is. The style guide and the Ask copy are read the same way whether their record carries its frontmatter in its content or in its metadata: `fetchStyleGuide`, the voice guidance site content and the social and series projections write with, the starter character's style signals, web chat's Ask copy and the homepage opening.
