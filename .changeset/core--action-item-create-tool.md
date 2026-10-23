---
"@rizom/brain": patch
---

Asking the brain for an action item creates a whole card: a new `action_item_create` tool on the action board writes it open, requested by the caller, from the conversation it was asked in and at the board's visibility (`shared` on a team brain), assigned to the member named, to the caller who takes it on, or to nobody. Action items no longer go through `system_create`, which could not set their capture time and status and made them public.
