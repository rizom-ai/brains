---
"@rizom/brain-ui": patch
"@rizom/brain": patch
---

A site or plugin package that installs or bundles its own copy of `@rizom/brain-ui` now reads the brain's image renderer and head collector. `MarkdownContent` in such a package renders `entity://image/<id>` references as the site build's optimized images, where it used to leave the unresolved reference, and its `Head` reaches the page head. Every copy shares the two contexts through a versioned global key.
