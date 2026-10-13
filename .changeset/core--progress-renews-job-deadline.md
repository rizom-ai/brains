---
"@brains/job-queue": patch
"@brains/site-builder-plugin": patch
---

A job's execution deadline now catches a stuck job rather than a long one: each progress report that advances the job starts the full window again, while a repeated report such as a heartbeat does not. The site build reports progress as it prepares each route as well as when it renders it, so a large site builds instead of being failed at the default five minutes.
