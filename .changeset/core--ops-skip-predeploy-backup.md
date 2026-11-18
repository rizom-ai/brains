---
"@rizom/ops": patch
"@rizom/brain": patch
"@brains/deploy-support": patch
---

Both scaffolded Deploy workflows take an operator-confirmed `skip_predeploy_backup` input. They are the rover-pilot workflow from `brains-ops init` and the standalone brain workflow from `brain init`. When a manually dispatched deploy sets the input, the verified predeploy snapshot is skipped. That is for a runtime whose own startup work keeps its job queue busy, so it can never pass the idle gate. The input is off by default, and a deploy started by a push or another workflow carries no inputs, so its snapshot always runs. Both workflows render the input and the step condition from one shared definition. `brains-ops init` now keeps the input that pilot repos added by hand instead of dropping it on every upgrade. The operator playbook and the deployment guide document the skip.
