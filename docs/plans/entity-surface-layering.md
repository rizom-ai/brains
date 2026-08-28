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

1. **Durable-batch protocol** — five ordered calls leaking job topology
   (`expectedChildren`, `rootJobId`, child id plumbing, manual settle).
   Replace with a managed bracket that owns ids, child settlement, and
   closure before release.
2. **Export journal** — acknowledgement deletes the intent: one global
   cursor, no consumer identity, "export" baked into the names. Names and
   contract shapes must be release-final now; consumer-scoped
   acknowledgements may land later only if additive.
3. **`recoverProjectionBatches`** — bootloader-only, takes a process-local
   reader, uncallable by any plugin. Remove from the plugin surface before
   release.

Owner of the subsystem executes; this is release-gate work, not
opportunistic refactoring.

## Standing note

Persistence-touching features from main get an explicit process-placement
decision before their methods gain worker proxies. Web-only operations refuse
in the worker (pattern landed in `3b342ebdd`); nothing becomes cross-process
silently.
