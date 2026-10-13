---
"@brains/web-chat": patch
---

Emit an explicit completion event after successful authenticated chat and confirmation streams, preventing Studio from incorrectly reporting completed replies as connection losses. Preserve error events and signal aborted requests separately; do not retry or replay actions.
