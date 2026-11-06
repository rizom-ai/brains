---
"@rizom/brain": patch
---

Identity singletons (the anchor profile, the brain character) are read as stored: an `entity://image/<id>` reference in their frontmatter stays a reference instead of being inlined as image data. An anchor profile's photo now reaches the site's layout, and no image data lands in the identity the brain gives its model.
