# Off-thread Turso persistence and binary transfers

## Status

- Architecture gate for 0.3 remains open; 0.2 stays libSQL, 0.3 is Turso-only.
- Staged asset binding, authenticated App endpoint registration and metadata-only image construction are implemented; existing image-constructor callers are updated.
- The canonical native publication candidate still requires a test-only database factory binding.
- Source owns upload/read binary authority, endpoint lifecycle and native publication/transaction association. Canonical downloads now use the App-owned authenticated endpoint, not direct driver access.
- Remote facades expose `assetTransfers` on one authenticated connection. `downloadFile` and `publishFile` compose actors, native authority and outcome observation. Local directory image import uses explicitly provisioned `fileAssets`; other buffered ingress/read callers remain.
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

## Current slice: local directory image import — complete

1. Extend canonical App integration with real directory import before implementation.
2. Inspect PNG/JPEG/GIF/WebP headers in a credited payload actor; retire transient inspection authority and retain only file metadata. Publication re-reads and verifies the inspected digest.
3. Replace local image `PreparedAsset` persistence with file publication, preserving batch scope, timestamps, visibility and durable jobs. Missing capability fails closed.
4. Provision explicit actor artifacts through App/Shell runtime options and authenticated owner loopback or worker RPC; join file operations before shared shutdown. Keep the runtime factory unchanged.

**Exit check:** canonical local import, repeat/skip, malformed-format retirement and joined-owner reopen pass alongside existing rollback and full-download coverage. Unit checks cover bounded header inspection, required actor metadata, pre-admission validation and shutdown waiting for inspection retirement. This is source application integration, not installed packaging or runtime factory acceptance.

**Next slice:** migrate the next real image ingress/read caller, moving its conversion or provider assembly into actors without buffered fallback. Package/default application provisioning remains milestone 3; do not switch the runtime factory until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
