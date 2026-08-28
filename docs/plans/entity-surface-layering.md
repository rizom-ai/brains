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

## Proposed shape (for subsystem-owner review)

Grounded in the actual call sites; the owner may amend.

- **Durable fan-out** becomes a handle with automatic settlement:
  `beginDurableBulkMutation({ source, rootJobId })` returns a batch whose
  `childRef(childKey)` tokens embed in job data, `seal({ expectedChildren })`
  commits the count at enqueue success, and `abort()` replaces the failure
  marker. `runDurableBulkMutationChild(ref, fn)` settles from the outcome of
  `fn` — resolve is completed, throw is failed — eliminating the manual
  settle-on-both-paths and the six re-threaded fields. `operationId` is
  dropped (always `rootJobId` in practice). Store question for the owner:
  children settling before seal must be tolerated.
- **Callback bracket** `runBulkMutation(input, fn)` is already right;
  unchanged.
- **Journal** gets neutral, release-final names —
  `listPendingEntityChanges` / `hasPendingEntityChanges` /
  `acknowledgeEntityChanges` — with consumer scoping later as an additive
  optional parameter.
- **`recoverProjectionBatches`** moves to an internal shell contract.

## Boundary casts — the actual defect, and the gate

The privileged methods are not on the typed plugin context at all today:
the service context narrows `entityService` to the curated client type, and
directory-sync reaches past it with `as IEntityService` in five production
sites (`batch-operations.ts:113`, `plugin.ts:599`,
`inline-image-conversion-handler.ts:49`, `projection-batch-job.ts:16,38`).
Typed boundaries are the point of this branch; these casts smuggle
capability access past the type system in-process.

Release-gate acceptance criteria:

1. The capability methods land on the typed plugin context deliberately, in
   the proposed shape — and all five casts are deleted.
2. Zero service-boundary casts in production plugin code, enforced by a
   check script (same pattern as `check-legacy-code`) so they cannot
   return.

## Standing note

Persistence-touching features from main get an explicit process-placement
decision before their methods gain worker proxies. Web-only operations refuse
in the worker (pattern landed in `3b342ebdd`); nothing becomes cross-process
silently.
