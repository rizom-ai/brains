---
"@rizom/brain": patch
---

A content pull no longer queues its work twice. The file watcher reports a large pull late, often minutes after git reconciliation has already queued the same imports and deletes, and the old ten-second, first-event-only suppression let those reports through: migrating Friedrich's corpus queued 3,731 redundant deletes and re-imported every file. The watcher now ignores a pulled path for as long as it still matches HEAD, however late or often it is reported; an edit made since still differs from HEAD and is imported.
