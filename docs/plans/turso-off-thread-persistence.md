# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Production ingestion/read byte handoffs and worker execution are not cut over.
- Runtime-state prefix clear now uses validated, sequential deletes in one transaction.
- Staged-asset binding and the existing worker/fixture implementation are recorded in separate commits; merging main is next.
- `shared/db/src/sqlite.ts` retains its existing runtime factory. Do not switch it before the production binary path is complete.
- No new standalone proofs during fixture-to-source promotion.

## Delivery milestones

| Milestone                              | Deliverable                                                                                                         | Exit check                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Canonical integration candidate** | Existing canonical jobs/image/shutdown flow on real worker-backed databases; fix ownership and caller blockers.     | Real service flow passes with unchanged budgets, atomicity and acknowledged cleanup. Distinguish test factory binding from runtime acceptance. |
| **2. Production binary path**          | Production ingress/read capabilities, worker-local inspection/conversion/verification and native staged binding.    | Real image and 100 MiB flows through production modules, authenticated cancellation and rollback; no whole-buffer RPC fallback.                |
| **3. Application cutover**             | Switch all five runtime factories; package workers/actors and wire single-owner lifecycle, including combined mode. | Canonical `start:minimal`, then `start:personal`; real jobs/auth/images/site rebuilds, installed startup, shutdown and restart.                |
| **4. Release acceptance**              | Complete working-set, crash recovery, import/deployment/backup/restore and rollback coverage.                       | SDK/native/transport/GC/RSS accounting, controller/grandchild recovery and explicit fleet/soak acceptance.                                     |

## Current slice: land existing work, then merge main

1. Validate and commit staged-asset binding and image callers independently of the worker fixtures.
2. Commit existing worker/fixture work separately, including its runtime-state compatibility fix. Leave no uncommitted work before proceeding.
3. Merge main into `work/turso-migration`; resolve conflicts and all resulting failures, including failures inherited from main.
4. Only after a clean merge, begin fixture-to-source promotion: protocol message pump, operation-specific reply validation, savepoint/staged-transfer routing and binary control plumbing.

**Exit check:** separate validated commits for existing work, main merged, all checks passing and a clean working tree. No new implementation slice while this is incomplete.

**Promotion baseline:** TypeScript files in `shared/db/test/fixtures/turso-thread/`: **9,883 lines**; in `shared/db/src/turso-worker/`: **2,325 lines**. Recount after the merge and after promotion. Fixtures must retain only setup/assertions, not implementation or implementation re-exports. Promotion must decrease fixture lines and increase source lines before it lands.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
