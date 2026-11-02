---
"@brains/job-queue": patch
"@brains/core": patch
"@rizom/brain": patch
---

An older brain's worker no longer runs jobs a newer brain queued. A rolling deploy runs the old and new containers side by side on one job queue, and the old worker could claim the new brain's startup work. Every job now records the version of the brain that queued it; a worker never claims or recovers a job a newer brain queued, and once a newer brain's worker is live, an older worker takes no new work while its in-flight jobs finish. A newer brain asking again for an older brain's pending job hands that job to itself. Each version runs its own worker slot, so the new worker no longer supersedes the old one mid-job. Jobs queued before this release carry no version and stay claimable by any worker; the gate takes effect from the deploy after the one that ships it.
