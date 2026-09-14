# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source owns upload/read binary authority, endpoint lifecycle and native publication/transaction association. Canonical downloads now use the App-owned authenticated endpoint, not direct driver access.
- Remote facades expose `assetTransfers`, a source metadata client using one authenticated connection. Reads remain reference-only; `cancelRead` now acknowledges idle or active scope retirement. Buffered ingestion/read callers still await coordinated replacement.
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

## Current slice: acknowledged active-read cancellation — complete

1. Extend the existing canonical RPC flow with cancellation before a download peer connects; establish the failing case before implementation.
2. Resolve cancellation authority from live socket-owned records, including active reads, without making download tickets replayable.
3. Hold native execution to verify cancellation cannot acknowledge early; test connected-peer cancellation, sibling isolation, foreign/replayed requests and owner reuse.
4. Validate and commit before another slice. Do not switch the runtime factory.

**Exit check:** successful cancellation waits for native scope retirement and releases read/transport resources, including before peer connection. Foreign and retired tickets reject; sibling offers survive. Canonical output/reopen still passes. Aborting the cancellation RPC is not acknowledgement, and published output is never retracted. The slice is committed with a clean working tree.

**Next slice:** compose `assetTransfers` and `FileProcessOwner` into lifetime-managed file handoffs, awaiting both native retirement and creator-owned actor exit on failure. Then replace ingestion/read callers and move inspection/conversion into payload actors. Keep the runtime factory unchanged until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
