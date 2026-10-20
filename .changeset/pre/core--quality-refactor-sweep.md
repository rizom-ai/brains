---
"@brains/utils": patch
"@brains/job-queue": patch
"@brains/core": patch
"@brains/entity-service": patch
"@brains/playbooks": patch
"@brains/directory-sync": patch
"@brains/webserver": patch
"@rizom/ops": patch
"@rizom/brain": patch
---

Behavior-preserving quality refactors: shared SerialQueue/KeyedSerialQueue primitive in @brains/utils replacing five hand-rolled promise-tail mutexes; directory-sync stress system split into command runner, git checkout, and health monitor modules; job-queue worker heartbeat/deadline/error-callback dedup and table-generic schema column helpers; consolidated pilot starter staleness detection; single-pass HTTP route registry views; projection wave planning simplification with indexed graph edges.
