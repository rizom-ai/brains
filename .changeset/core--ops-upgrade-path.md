---
"@rizom/ops": patch
---

Add `brains-ops upgrade`: bumps the `@rizom/ops` pin and reruns the scaffold refresh from the upgraded package, plus a scheduled Upgrade workflow template that stages the result as a reviewable PR. Init reruns also stop resurrecting deleted first-run example content (`users/alice.yaml`, `cohorts/cohort-1.yaml`, `docs/canonical-crossover-record.md`).
