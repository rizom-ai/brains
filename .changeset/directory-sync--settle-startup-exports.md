---
"@brains/directory-sync": patch
---

Settle pending durable entity exports before the initial Git pull and directory import. Preserve acknowledged edits across restart instead of overwriting them with stale checkout content; if export settlement fails, retain the pending intent and fail initial sync closed.
