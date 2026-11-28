---
"@brains/contracts": minor
"@brains/topics": minor
"@brains/studio": minor
"@rizom/brain": minor
---

Studio lists what a collection holds.

- A series or a topic lists its entries when opened, and its row in the list says how many it holds ("12 posts"). A series' members are the entries in its Series group. A topic's are worked out by the topics plugin from extraction's votes, the same sources the topic distribution counts.
- Which types are collections now comes from their registrations: a type with a member group, or one whose plugin answers the new `collectionTypesContract` and `collectionMembersContract`. The hardcoded name list is gone, so projects are no longer treated as a collection.
- Library lists its types as one list ordered by recent use, without the Content and Collections headings.
