---
"@brains/plugins": patch
"@rizom/brain": patch
---

A message interface answers in the thread a message came from: `send` is given the inbound `channel` with its `threadId`, where it was given only the channel id, so a reply to a threaded message landed outside its thread.
