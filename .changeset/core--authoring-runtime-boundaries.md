---
"@brains/sdk": minor
"@brains/plugins": minor
"@brains/messaging-service": minor
"@brains/job-queue": patch
"@brains/http-host": patch
"@brains/utils": patch
"@brains/email": patch
"@rizom/brain": minor
---

Correct schema-transform boundaries for declared jobs and requests. Persist
validated JSON wire input/results rather than feeding transformed outputs back
through input schemas. Worker bindings retain their validated input without a
cast or repeated parsing. Apply declared retry and pending-deduplication policies
across service, generic-interface, message-interface and operator enqueue paths.
Batch children retain their retry policy; reject oncePending children before
queuing a batch because shared children cannot preserve per-root ownership.

Use the same subscription validation and coded request protocol in each family.
Preserve invalid_input and invalid_response through the real message bus, and
make the schema-bearing request overload available wherever author contexts
already expose messaging.request. Preserve raw-handler fallback order while
reporting exhausted failures, skip no-op replies, and return no-op for broadcasts
rather than a missing-handler error. Avoid logging raw handler exception text;
email's sender lookup now handles typed failures and logs only a derived key.
The harness now uses that real in-memory bus.

Await generic-interface setup and support resource cleanup in both interface
families. Attempt every cleanup even after a failure, roll failed harness
registration back immediately, and reuse production resource scopes for teardown.
Share exact/longest-prefix HTTP route matching with the public harness, including
URL query handling.

Extend the external-consumer regressions to cover these failure paths and correct
the guide and golden manifests to target the reviewed local tarball rather than
claiming compatibility with historical registry APIs. Registry nomination,
verified release floors, merging and publishing remain separate.
