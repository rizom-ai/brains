# Decision: directory-sync stays a plugin; entity surface reshaped before stable

## Status

Decided 2026-08-12 by the owner. Evidence: merge `3b342ebdd` (346 main
commits), where eleven single-consumer methods on `EntityService` forced
per-method worker-proxy decisions.

## Decision

Criterion: keep the plugin + surface only if other plugins could use the same
methods.

- **Bulk-mutation fencing**: second consumer is near — inbox burst ingestion
  has the same projection-stampede problem. Keep.
- **Export journal**: schema is generic; outbound publishing (ATProto,
  social, newsletter) needs the same durable act-exactly-once primitive.
  Keep.

Directory-sync remains a plugin. The surface remains plugin API.

## Surface assessment: right capability, wrong shape — fix before stable

Stable v0.2.0 makes the plugin-facing surface a compatibility contract, so
the shape must be right **before release**, not at the second consumer.

1. **Durable-batch protocol** — DONE. `context.entityCoordination`
   (`EntityBulkCoordination`, bound to the plugin id as mutation source)
   exposes `beginDurableBulkMutation({ rootJobId, expectedChildren })` →
   handle with `childRef(childKey)` / `seal()` / `abort()`, plus ref-keyed
   `runDurableBulkMutationChild(ref, jobId, fn)` and
   `settleDurableBulkMutationChild(ref, jobId, outcome)`. `source` and
   `operationId` no longer appear in plugin code or job payloads. All five
   `as IEntityService` casts in directory-sync are deleted; the plugin sees
   only `EntityServiceClient`. Two deliberate deviations from the earlier
   sketch: `expectedChildren` stays at `begin` (the durable root marker must
   exist before enqueue makes children runnable — moving it to `seal` needs
   store tolerance for early-settling children, surgery this did not need),
   and explicit settle survives because terminal outcome belongs to the job
   queue's retry lifecycle (`onTerminalSuccess`/`onTerminalError`), not to
   the mutation bracket's first throw.
2. **Export journal** — acknowledgement deletes the intent: one global
   cursor, no consumer identity, "export" baked into the names. Names and
   contract shapes must be release-final now; consumer-scoped
   acknowledgements may land later only if additive.
3. **`recoverProjectionBatches`** — bootloader-only, takes a process-local
   reader, uncallable by any plugin. Remove from the plugin surface before
   release.

Owner of the subsystem executes items 2–3; release-gate work, not
opportunistic refactoring. The five raw `EntityService` methods behind
`entityCoordination` remain the internal shell/RPC contract, excluded from
`EntityServiceClient`.

## Standing note

Persistence-touching features from main get an explicit process-placement
decision before their methods gain worker proxies. Web-only operations refuse
in the worker (pattern landed in `3b342ebdd`); nothing becomes cross-process
silently.
