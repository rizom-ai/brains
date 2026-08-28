# Decision: directory-sync stays a plugin; entity surface frozen, not blessed

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

## Surface assessment: right capability, wrong shape

Frozen as-is; reshape only at the named triggers.

1. **Durable-batch protocol** — five ordered calls leaking job topology
   (`expectedChildren`, `rootJobId`, child id plumbing, manual settle).
   Reshape into a managed bracket **when inbox adopts it**, driven by inbox's
   requirements.
2. **Export journal** — acknowledgement deletes the intent: one global
   cursor, no consumer identity, "export" in the names. Add consumer-scoped
   acknowledgements and neutral naming **when a second subscriber lands**.
3. **`recoverProjectionBatches`** — bootloader-only, takes a process-local
   reader, uncallable by any plugin. Remove from the plugin surface now
   (shell-internal contract); owner of the subsystem executes.

## Standing note

Persistence-touching features from main get an explicit process-placement
decision before their methods gain worker proxies. Web-only operations refuse
in the worker (pattern landed in `3b342ebdd`); nothing becomes cross-process
silently.
