---
"@brains/plugins": patch
"@brains/runtime-state": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Make author callback objects match their declared reader capabilities. Keep runtime
principal replacement and profile-kind registration out of ordinary setup and
reaction readers. Narrow job attachments/uploads, conversation reads, and identity
reads without removing the runtime host APIs or interface-owned upload writers.

Return frozen, bound facades for scoped state and upload stores rather than exposing
implementation fields. Prevent a scoped state handle from redirecting writes by
mutating its hidden namespace. Reject upload namespace path traversal at the
shared declaration boundary.

Add public source/built/packed reader probes, receiver-binding checks, upload facade
coverage, and a real SQLite scope-isolation regression. This is API capability
hygiene, not a sandbox for arbitrary plugin JavaScript.
