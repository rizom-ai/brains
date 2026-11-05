---
"@brains/conversation-service": patch
"@rizom/brain": patch
---

A conversation's messages come back in the order they were added, also when several share a timestamp. Messages added within one millisecond tied on their timestamp, so recent messages and message ranges could return them in either order.
