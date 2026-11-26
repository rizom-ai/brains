---
"@brains/a2a": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

A brain serves and lists only content types to a trusted peer over the entity-sharing extension. Its own system records, such as sync conflicts and grouping definitions, are stored as shared by default and were offered too; they are now answered with the same `404` as any other miss.
