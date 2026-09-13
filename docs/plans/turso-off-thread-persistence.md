# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source now owns the worker message pump, reply validation, staged/savepoint routing, budgets, authenticated binary scope plumbing and network bridges. Runtime ingestion/read handoffs are not cut over.
- Runtime-state prefix clear now uses validated, sequential deletes in one transaction.
- Staged-asset binding and existing worker/fixture work are committed separately; main is merged, including new RPC contracts and moved test helpers.
- `shared/db/src/sqlite.ts` retains its existing runtime factory. Do not switch it before the production binary path is complete.
- No new standalone proofs during fixture-to-source promotion.

## Delivery milestones

| Milestone                              | Deliverable                                                                                                         | Exit check                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Canonical integration candidate** | Existing canonical jobs/image/shutdown flow on real worker-backed databases; fix ownership and caller blockers.     | Real service flow passes with unchanged budgets, atomicity and acknowledged cleanup. Distinguish test factory binding from runtime acceptance. |
| **2. Production binary path**          | Production ingress/read capabilities, worker-local inspection/conversion/verification and native staged binding.    | Real image and 100 MiB flows through production modules, authenticated cancellation and rollback; no whole-buffer RPC fallback.                |
| **3. Application cutover**             | Switch all five runtime factories; package workers/actors and wire single-owner lifecycle, including combined mode. | Canonical `start:minimal`, then `start:personal`; real jobs/auth/images/site rebuilds, installed startup, shutdown and restart.                |
| **4. Release acceptance**              | Complete working-set, crash recovery, import/deployment/backup/restore and rollback coverage.                       | SDK/native/transport/GC/RSS accounting, controller/grandchild recovery and explicit fleet/soak acceptance.                                     |

## Current slice: fixture-to-source promotion — complete

1. Run existing integration tests before changing implementation. No new standalone proofs.
2. Move the protocol message pump, operation-specific reply validation, savepoint/staged-transfer routing and binary control plumbing into `shared/db/src/turso-worker/`.
3. Point integration callers and packaging at the source implementation; leave only setup/assertions in fixtures, with no implementation re-exports.
4. Validate, update Status and measured line counts, and commit before another slice. Do not switch the runtime factory.

**Exit check:** production source owns those implementations, fixture lines decrease and source lines increase, existing integration/packaging checks pass, and the promotion is committed with a clean working tree.

**Measured result (TypeScript lines):** `shared/db/test/fixtures/turso-thread/` **9,908 → 4,148**; `shared/db/src/turso-worker/` **2,325 → 8,091**. Twenty-nine implementation modules moved; their old fixture paths were deleted, not replaced with forwarding exports. Remaining fixtures are integration scenarios and instrumented test input/output/fault actors. Existing integration and installed-actor packaging checks use the source implementation. No standalone proof tests were added.

**Next slice:** complete the production binary path and its real ingestion/read callers. Keep the runtime factory unchanged until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
