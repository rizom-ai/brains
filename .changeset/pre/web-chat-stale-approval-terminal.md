---
"@brains/web-chat": patch
---

Resolve expired or otherwise stale web-chat approval responses with a terminal AI SDK tool error event. This prevents completed stale cards from repeatedly resubmitting themselves and emitting `No pending action to confirm.` in a loop.
