---
"@rizom/brain": patch
---

Publishing queue actions accept an entity's title or slug as well as its id, as the system tools do, and queue it under its id. Before, `publishing_manage` queue-add with a post's title failed with "Entity not found" and the assistant told admins it could not queue the draft.
