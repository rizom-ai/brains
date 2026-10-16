---
"@rizom/brain": patch
---

Content synced after startup reaches the site again. The web process schedules rebuilds while the worker runs them, so a rebuild queued once used to block every later one until the next restart; rebuilds now rely on the job queue, which keeps one pending build per environment. A build replaced by a newer one completes instead of failing and being retried against its replacement. A file removal seen while git rewrites a pulled file no longer deletes the entity whose file is back on disk.
