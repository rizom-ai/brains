---
"@rizom/brain": patch
---

A generation job that is run again after its post, deck, note, social post or newsletter was saved no longer writes a second one. Before, a job that died after saving, or whose follow-up failed so the queue retried it, saved a copy under the next free id with the same status. A queued copy was then published as well: a second LinkedIn post, a second newsletter send, or a second post whose publishing sent another newsletter. Now the job records its saved entity in the same transaction, and a rerun finishes from that entity without generating again. The job's follow-ups, such as queuing a cover image, run once per job, and a rerun skips the image job while the first one is still waiting.
