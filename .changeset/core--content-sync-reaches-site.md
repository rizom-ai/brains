---
"@rizom/brain": patch
---

Content synced after startup reaches the site again. Rebuild scheduling uses the installed declarative job's durable pending-only deduplication, rather than process-local generation counters: web and worker processes need not share lifecycle callbacks. A running build can have one pending successor per environment. Wave-completion subscriptions run in both roles so worker-local completion also schedules a rebuild.

A superseded request completes without emitting a build-completed event or certifying its replacement. Other rendering failures and cancellations throw coded SDK errors for the queue's retry policy, retaining diagnostics as local causes. The rendering pipeline receives the job cancellation signal; an earlier caller cancellation is not reclassified as supersession. Shared-route build serialization and shutdown draining remain intact; this is not cross-process output locking or a total shutdown-duration bound.

Directory sync rechecks the removed path as well as alternative entity files. A file recreated by Git before that check is reimported instead of deleting its entity. The filesystem check and database deletion are not an atomic transaction. No native plugin bridge or new public capability is introduced.
