---
"@rizom/brain": patch
---

`action_item_create` takes a due date: the date a request names, as YYYY-MM-DD, or "none". A due date that is not a date is refused with today's date, so the agent can correct it.
