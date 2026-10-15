---
"@rizom/brain": patch
---

A requested site build or a scheduled recurring check is no longer lost when the job queue refuses it because another process held the queue's write lock past the enqueue budget. A site build stays requested and is enqueued again, first after one debounce window and then backing off to once a minute, until the queue admits it. A scheduled recurring check is retried the same way, starting after a second, until the queue admits it, the next scheduled run supersedes it, or the check is unregistered or stopped.
