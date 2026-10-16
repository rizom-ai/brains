---
"@brains/job-queue": patch
"@brains/test-utils": patch
---

Fix batch enqueueing from validation-only processes: BatchJobManager preflight now checks the declared validator instead of requiring an executable handler. Since the web/worker runtime split, the web process registers job handlers in validation-only mode, so every enqueueBatch from web (directory-sync imports, deletes, cleanups via periodic git sync and the file watcher) threw "No handler registered for job type" and pulled git content was never imported.
