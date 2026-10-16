---
"@rizom/brain": patch
---

A job whose attempt lease expired is reclaimed by the next free worker even while the worker that claimed it is still running; the attempt fence stops the old attempt's late writes. Before, a worker that stopped renewing a lease without exiting left the job processing indefinitely, which kept the queue from ever going idle and blocked every deploy at the pre-deploy backup. The backup gate now treats such an abandoned job as rerunnable work, names it in the deploy log and backs up.
