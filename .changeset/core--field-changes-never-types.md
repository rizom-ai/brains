---
"@brains/core": patch
"@rizom/brain": patch
---

system_create and system_update no longer offer the fields of an entity type the brain's action policy never lets system tools write, such as action items on create, conversation summaries on create, and analytics traffic snapshots. Every trusted and admin model call that shows those tools sends less: about 960 input tokens fewer on a team brain.
