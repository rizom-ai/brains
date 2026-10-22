---
"@rizom/brain": patch
---

When a tool call fails and the model ends its turn with no text, the reply now reports the tool's error instead of arriving empty. `playbook_manage` tells the model that `action=start` requires `playbookId`, and an action missing a required field returns a readable error naming the field. The playbook entity instructions name `playbook_manage action=status` instead of the removed `playbook_status`.
