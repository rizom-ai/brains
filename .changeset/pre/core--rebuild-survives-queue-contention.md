---
"@rizom/brain": patch
---

Work is no longer lost when the job queue refuses an enqueue because another process held the queue's write lock past the enqueue budget. Each of these is enqueued again until the queue admits it:

- A requested site build. It is retried first after one debounce window, then backing off to once a minute.
- A scheduled or catch-up recurring check run. It is retried until the next scheduled run supersedes it, or until the check is unregistered or stopped.
- A FAQ capture or fold, a topic extraction wakeup, and a scheduled social post or newsletter generation. These are retried until the plugin shuts down.
- A publish asset preflight. Each retry re-reads the entity, so nothing is queued for an entity that is no longer published or whose asset already exists.
- A watched file change in directory sync. It is retried until its sync generation stops.
- The embedding job of an entity just created or updated. The entity write now resolves without throwing, and the embedding is retried once per entity, with the latest content winning, until the entity service closes. The startup embedding backfill still covers a retry pending when the process exits. Directory sync's import wait no longer polls an empty job id until it times out.
- A generated post's cover or social image. The generation job now succeeds, because the post exists, and the image is retried until the plugin shuts down.

Retries start after a second and double up to a minute.
