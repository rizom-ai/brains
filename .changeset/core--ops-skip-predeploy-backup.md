---
"@rizom/ops": patch
---

The rover-pilot Deploy workflow takes an operator-confirmed `skip_predeploy_backup` input. When a manually dispatched deploy sets it, the verified predeploy snapshot is skipped. That is for a runtime whose own startup work keeps its job queue busy, so it can never pass the idle gate. The input is off by default, and push and reconcile deploys carry no inputs, so their snapshot always runs. `brains-ops init` now keeps the input that pilot repos added by hand instead of dropping it on every upgrade. The operator playbook documents the skip.
