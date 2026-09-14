# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source owns upload/read binary authority, endpoint lifecycle and native publication/transaction association. Canonical downloads now use the App-owned authenticated endpoint, not direct driver access.
- Binary read callers supply only an asset reference; the owner selects and verifies the native row. General ingestion/read callers remain unmigrated.
- Canonical uploads and verified file output use source payload actors. Output publication is no-replace and acknowledges file/directory cleanup; failed staging is retained. Instrumented fault actors remain in fixtures.
- `shared/db/src/sqlite.ts` retains its existing runtime factory. Do not switch it before the production binary path is complete.
- Existing canonical integration drives the binary path; no new standalone proofs were added.

## Delivery milestones

| Milestone                              | Deliverable                                                                                                         | Exit check                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Canonical integration candidate** | Existing canonical jobs/image/shutdown flow on real worker-backed databases; fix ownership and caller blockers.     | Real service flow passes with unchanged budgets, atomicity and acknowledged cleanup. Distinguish test factory binding from runtime acceptance. |
| **2. Production binary path**          | Production ingress/read capabilities, worker-local inspection/conversion/verification and native staged binding.    | Real image and 100 MiB flows through production modules, authenticated cancellation and rollback; no whole-buffer RPC fallback.                |
| **3. Application cutover**             | Switch all five runtime factories; package workers/actors and wire single-owner lifecycle, including combined mode. | Canonical `start:minimal`, then `start:personal`; real jobs/auth/images/site rebuilds, installed startup, shutdown and restart.                |
| **4. Release acceptance**              | Complete working-set, crash recovery, import/deployment/backup/restore and rollback coverage.                       | SDK/native/transport/GC/RSS accounting, controller/grandchild recovery and explicit fleet/soak acceptance.                                     |

## Current slice: source file-output consumer — complete

1. Require file output in canonical read-back and test the sink before implementation.
2. Add a credited receive/write/hash actor and no-replace staging sink; acknowledge success only after digest verification, socket/file closure and file/directory sync.
3. Re-read every canonical output byte with the source producer; test disconnect without forced consumer termination and use the source output actor in existing installed checks.
4. Validate and commit before another slice. Do not switch the runtime factory.

**Exit check:** canonical and reopened images reach verified output files through authenticated RPC and source actors; incomplete output and cancellation before publication leave staging only; existing destinations are never overwritten. A published file is not retracted if acknowledgement fails. Existing JS/compiled installed actor checks pass, without claiming installed application acceptance or filesystem path authorization. The slice is committed with a clean working tree.

**Next slice:** coordinated `RemoteEntityService`/ingestion/read caller migration onto the source file handoffs, with inspection/conversion in payload actors. Keep the runtime factory unchanged until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
