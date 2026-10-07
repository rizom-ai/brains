---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Snapshot and validate entity-type configuration before registration, and return detached metadata copies. Changing a returned publish-status list or search weight no longer changes registry policy. Omit undeclared fields without evaluating their getters, and validate before publishing any registration state. Use the same copy operation for declarative definitions and the runtime test harness.

Snapshot attachment metadata and return detached copies while preserving bound provider resolution. Failed registration leaves an existing provider intact, and cleanup from a superseded registration no longer removes its replacement.

Apply the shared projection reader adapters to the mock runtime too, including configured space snapshots. Add registry, cleanup, harness, and source/built/packed public SDK regressions. No persisted state keys or migration behavior change.
