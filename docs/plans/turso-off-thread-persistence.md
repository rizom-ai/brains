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

## Current slice: Bun/WebView file renderer — integrated candidate

1. Keep Bun's existing WebView renderer. A source Bun actor renders an `index.html` + assets directory to a 1200×630 PNG; serving, SDK buffers, hashing and file writes stay in that actor. No separate Chromium factory.
2. `FileProcessOwner.produce` admits one bulk producer within its existing two-child limit and joins actual Bun exit. The 100 MiB output ceiling, 32 KiB writes, no-replace publication and failed staging retention remain. Static inputs are size-checked before bounded stream reads; SDK/native/browser peak memory is not established.
3. Explicit `producerUrl` provisioning exposes `fileAssets.withProducedFile`; controllers exchange paths and facts. The callback owns the output through settlement; acknowledged results survive late cancellation. Callers retain their input directory through the operation.

**Exit check:** the existing canonical worker App downloads a referenced asset, runs real Bun/WebView rendering, inspects and natively publishes the PNG, then verifies it by authenticated download after restart. Independent rendering and worker jobs share unchanged admission and join both outcomes. After a serial run exceeded five seconds, three concurrent runs passed at 4.47/4.14/4.11 seconds with the default timeout unchanged. Focused tests cover limits, failure retention, admission and borrowed-file lifetime.

**Scope:** current OG providers/source-render jobs still use their buffered path; this slice supplies and integrates the actor capability, not their cutover. Bun actor exit is acknowledged; WebView descendant shutdown is requested, not independently acknowledged. Descendant recovery and peak-memory proof remain release-hardening work, not a prerequisite Chromium-factory project.

**Next slice:** wire OG attachment providers and the real source-render job to `withFile`/`withProducedFile`, using owned downloads for referenced images instead of controller data URLs. Keep PDF/AI and other buffered callers explicitly pending. Package/default application provisioning remains milestone 3; do not switch the runtime factory until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
