# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source owns upload/read binary authority, endpoint lifecycle and native publication/transaction association. Canonical downloads now use the App-owned authenticated endpoint, not direct driver access.
- Read callers supply only an asset reference; the owner selects the native row and verifies its digest before offering a snapshot. General ingestion/read callers remain unmigrated.
- Canonical uploads and installed file-transfer checks use the source-only file actor; synthetic/fault generation remains confined to fixtures.
- `shared/db/src/sqlite.ts` retains its existing runtime factory. Do not switch it before the production binary path is complete.
- Existing canonical integration drives the binary path; no new standalone proofs were added.

## Delivery milestones

| Milestone                              | Deliverable                                                                                                         | Exit check                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Canonical integration candidate** | Existing canonical jobs/image/shutdown flow on real worker-backed databases; fix ownership and caller blockers.     | Real service flow passes with unchanged budgets, atomicity and acknowledged cleanup. Distinguish test factory binding from runtime acceptance. |
| **2. Production binary path**          | Production ingress/read capabilities, worker-local inspection/conversion/verification and native staged binding.    | Real image and 100 MiB flows through production modules, authenticated cancellation and rollback; no whole-buffer RPC fallback.                |
| **3. Application cutover**             | Switch all five runtime factories; package workers/actors and wire single-owner lifecycle, including combined mode. | Canonical `start:minimal`, then `start:personal`; real jobs/auth/images/site rebuilds, installed startup, shutdown and restart.                |
| **4. Release acceptance**              | Complete working-set, crash recovery, import/deployment/backup/restore and rollback coverage.                       | SDK/native/transport/GC/RSS accounting, controller/grandchild recovery and explicit fleet/soak acceptance.                                     |

## Current slice: authenticated asset read capabilities — complete

1. Replace direct-driver canonical read-back with the real App endpoint before implementation.
2. Compose source read scopes, credited egress and one-use socket-bound endpoints; include reads in acknowledged binary-authority shutdown.
3. Select read plans inside the asset repository from references only; reject corrupt digests before handing off a capability.
4. Validate and commit before another slice. Do not switch the runtime factory.

**Exit check:** complete read-back and joined-owner reopen use authenticated RPC. Foreign sockets, replay, caller SQL and corrupt digests reject; disconnect reaches `connectionSignal`, native cleanup is acknowledged and the read owner remains reusable. Existing installed actor checks are not installed application acceptance. The slice is committed with a clean working tree.

**Next slice:** source read-consumer/output handoffs and coordinated `RemoteEntityService`/ingestion/read caller migration. The read-back consumer remains a test actor; inspection/conversion must move to payload actors. Keep the runtime factory unchanged until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
