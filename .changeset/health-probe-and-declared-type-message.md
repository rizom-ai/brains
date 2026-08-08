---
"@brains/job-queue": patch
"@rizom/ops": patch
---

Route-registry review follow-ups: the rover-pilot deploy template's origin-TLS check probes `/health/live` instead of the removed aggregate `/health`, and enqueue-side preflights report "No job type declared" instead of the stale "No handler registered" message now that they check declared validators rather than executable handlers.
