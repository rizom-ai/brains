---
"@brains/job-queue": patch
---

Validate durable runtime-update page sizes before querying SQLite: require an integer from zero to 1,000 and return zero-sized pages without database I/O. Preserve the existing 1,000-row service default, indexed tuple seek, SQL LIMIT and timestamp/ID cursor ordering. Invalid sizes now reject instead of allowing negative SQLite limits to read the entire queue.
