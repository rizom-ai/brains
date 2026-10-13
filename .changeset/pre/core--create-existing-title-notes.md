---
"@rizom/brain": patch
---

`system_create` refuses a title that already exists for notes and other plugin-handled types too, and points the model to `system_update`; `replace: true` still creates a deliberate copy. Before, an edit of a just-imported note that the model misrouted to `system_create` silently saved a duplicate such as `community-launch-plan-2`, sometimes with the original upload's content instead of the edits.
