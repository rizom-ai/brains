---
"@brains/plugins": patch
"@brains/identity-service": patch
"@brains/sdk": minor
"@rizom/brain": minor
---

Expose only `report` on declared job progress objects, preserving detached calls, scaling, and rejection behavior while keeping reporter callbacks and heartbeat controls with the runtime. Apply the same projection in the direct job test-context helper.

Publish only validated profile-kind metadata and the declared fields schema. Do not copy undeclared registration properties or evaluate their getters; read and validate the fields schema once.

Add `profileKind` to the public test harness options so authors can exercise selected-profile behavior after finalization, including rejection of an unregistered selection. Add source/built/packed SDK regressions and direct runtime tests for these boundaries.
