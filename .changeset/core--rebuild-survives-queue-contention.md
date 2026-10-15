---
"@rizom/brain": patch
---

A requested site build is no longer lost when the job queue refuses it because another process held the queue's write lock past the enqueue budget. The build stays requested and is enqueued again, first after one debounce window and then backing off to once a minute, until the queue admits it.
