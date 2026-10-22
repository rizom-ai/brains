---
"@rizom/brain": patch
---

Action items and decisions are stored as flat files: a card added on the board is named after its title (`action-item/order-name-badges-k3f9a2.md`), an Inbox card is `inbox-<source>-<item>` and conversation memory is `<conversation>-<type>-<n>-<hash>`, with no colon to nest them in folders. Existing ones move to their flat ids once startup content settles, keeping their content, visibility and dates.
