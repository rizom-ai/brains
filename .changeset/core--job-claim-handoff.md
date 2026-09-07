---
"@rizom/brain": patch
---

Start each claimed job under worker supervision before requesting the next claim. A later dequeue error or stall can no longer strand an earlier durable processing attempt without its handler or lease heartbeat. Preserve attempt fencing, concurrency limits, retry policy, and stop/drain behavior.
