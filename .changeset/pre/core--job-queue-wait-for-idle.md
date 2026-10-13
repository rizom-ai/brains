---
"@brains/job-queue": patch
---

Add `waitForIdle` to the job queue so callers can await a settled queue instead of sampling counters. Work here cascades — completing a job can enqueue the next — so idle means the queue stayed empty for a quiet window rather than being momentarily empty, and a timeout reports what is still outstanding.
