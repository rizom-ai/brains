---
"@brains/chat": patch
---

Retain validated Discord message/channel/attachment IDs when native file delivery fails after receiving a response. Keep these outcomes distinct from completed delivery, preserve original causes, and stop later artifact sends without replay. Reject malformed evidence and line-terminated routing/receipt IDs before treating them as valid metadata.
