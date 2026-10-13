---
"@rizom/brain": patch
---

Fix a rare "Projection batch cannot join active batch" fencing failure that could hit unrelated jobs. The job queue dispatches jobs as Effect fibers, which have no relationship to Node's `AsyncLocalStorage` tracking, so an unrelated job's leftover projection-batch scope could appear ambient to a different job and trip the identity fence on jobs that were never actually nested inside it. The worker now resets the projection-batch coordinator's ambient scope to empty before running each job, so a job's batch identity can never leak from another job.
