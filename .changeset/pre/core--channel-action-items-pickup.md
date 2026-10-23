---
"@rizom/brain": patch
---

A brain picks up action items from the chat spaces it is configured for (`spaces`), without anyone mentioning it: each stored message wakes a job that reads the space's messages after a saved bookmark, with earlier ones as context, and adds a card for each action item they commit to, requested by its speaker and assigned to its owner when they have a brain account, at conversation memory's visibility. A catch-up at startup and daily queues any space whose messages are past its bookmark.
