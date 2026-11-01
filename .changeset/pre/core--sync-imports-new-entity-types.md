---
"@brains/directory-sync": patch
"@rizom/brain": patch
---

Directory sync no longer loses files whose entity type a worker cannot import. During a rolling deploy the previous container's worker shares the job queue and claimed the new brain's startup import; without the new type it skipped those files and the batch completed, so docs.rizom.ai reported a successful sync with no guides. An import job now names the entity types it carries and a worker that does not register one fails the job, which retries on the current worker. The sync checkpoint records which entity types the last scan covered: when the set changes, a startup or import fails, or a worker refused a job, the next sync rescans every file instead of only what changed since the checkpoint. Concurrent sync requests wait for each other instead of the later one reporting "no files to import", the startup run records its own outcome, and a worker process no longer marks the running startup sync as failed. `directory_sync` takes `full: true` to rescan every file on demand.
