# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source owns upload/read binary authority, endpoint lifecycle and native publication/transaction association. Canonical downloads now use the App-owned authenticated endpoint, not direct driver access.
- Remote facades expose `assetTransfers` on one authenticated connection. `downloadFile` and `publishFile` compose file actors, native authority and outcome observation. Buffered ingestion/read callers still await coordinated replacement.
- Normal canonical RPC transfers use source payload actors and `FileProcessOwner`, with two-child admission, strict metadata, explicit artifacts and actual exit joins. Instrumented process ownership remains for fault exercises; failed staging is retained and output is never overwritten.
- `shared/db/src/sqlite.ts` retains its existing runtime factory. Do not switch it before the production binary path is complete.
- Existing canonical integration drives the binary path; no new standalone proofs were added.

## Delivery milestones

| Milestone                              | Deliverable                                                                                                         | Exit check                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Canonical integration candidate** | Existing canonical jobs/image/shutdown flow on real worker-backed databases; fix ownership and caller blockers.     | Real service flow passes with unchanged budgets, atomicity and acknowledged cleanup. Distinguish test factory binding from runtime acceptance. |
| **2. Production binary path**          | Production ingress/read capabilities, worker-local inspection/conversion/verification and native staged binding.    | Real image and 100 MiB flows through production modules, authenticated cancellation and rollback; no whole-buffer RPC fallback.                |
| **3. Application cutover**             | Switch all five runtime factories; package workers/actors and wire single-owner lifecycle, including combined mode. | Canonical `start:minimal`, then `start:personal`; real jobs/auth/images/site rebuilds, installed startup, shutdown and restart.                |
| **4. Release acceptance**              | Complete working-set, crash recovery, import/deployment/backup/restore and rollback coverage.                       | SDK/native/transport/GC/RSS accounting, controller/grandchild recovery and explicit fleet/soak acceptance.                                     |

## Current slice: file-upload/publication handoff — complete

1. Require `assetTransfers.publishFile` in the existing canonical publication flow before implementation.
2. Validate file/request metadata before admission, join actor/native receipts and verify their digest/size against the entity before publication.
3. Retain socket-bound cancellation authority across upload/receipt rotation, awaiting native retirement. Once publication is submitted, observe its outcome without cancellation or replay; fence failed outcomes.
4. Validate and commit before another slice. Do not switch the runtime factory.

**Exit check:** canonical publication and full output/reopen use source handoffs. Tests cover cancellation before peer connection and after sealing, native retirement delay, foreign/replayed authority, actor exit and non-retraction of admitted publication. File mismatch never publishes; failed retirement/outcomes retain causes and fence reuse. Caller-owned shutdown still joins the handoff. The slice is committed with a clean working tree.

**Next slice:** migrate the real directory-sync/image ingestion and read callers onto the file handoffs, moving inspection/conversion into payload actors and provisioning their explicit runtime artifacts. Start with one existing image flow, not another standalone proof. Keep the runtime factory unchanged until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
