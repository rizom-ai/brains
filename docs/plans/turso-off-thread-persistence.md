# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source owns upload/read binary authority, endpoint lifecycle and native publication/transaction association. Canonical downloads now use the App-owned authenticated endpoint, not direct driver access.
- Remote facades expose `assetTransfers` on one authenticated connection. `downloadFile` and `publishFile` compose actors, native authority and outcome observation. Directory image import/export and URL conversion use explicitly provisioned `fileAssets`; other buffered ingress/read callers remain.
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

## Current slice: scoped file attachment contract — complete

1. `attachments.withFile` supports file-only providers and validates strict PNG/PDF metadata plus the shared absolute-path/100 MiB source descriptor. It never falls back to buffered resolution; existing buffered callers remain unmigrated.
2. Permit one consumer admission, reject pre-cancelled work, and join both consumer and provider settlement. Preserve distinct consumer/cleanup causes and acknowledged results despite late cancellation.
3. Providers must combine caller/lifetime cancellation, keep the borrowed file through consumer settlement, and acknowledge their own cleanup. Registry joining cannot repair premature file deletion. Descriptors are not provenance: native inspection/publication still verify bytes.

**Exit check:** registry and entity/service context coverage exercises metadata validation, closed/duplicate admission, premature provider settlement, distinct failure causes and late cancellation. No new actors, app startup or timeout changes. Source-render publication safety remains covered; source rendering itself is still buffered.

**Next slice:** establish observable browser ownership for render actors: the current WebView adapter requests global browser shutdown but does not acknowledge process exit. Then implement file-producing rendering and referenced-image resolution, and migrate the real source-render job without a buffer-to-file shim. Package/default application provisioning remains milestone 3; do not switch the runtime factory until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
