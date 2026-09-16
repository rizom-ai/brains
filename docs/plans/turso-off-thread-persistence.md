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

## Current slice: printable PDF providers — file-only candidate

1. Keep Bun's existing WebView renderer. The source actor now renders PNG or PDF from `index.html`, assets and a required strict `render.json` instruction. Instruction reads are regular-file/no-follow, capped at 128 bytes even if the file grows, and closed before rendering. Serving, SDK buffers, hashing and writes stay in that actor; no separate Chromium factory.
2. `FileProcessOwner.produce` admits one bulk producer within its existing two-child limit and joins actual Bun exit. The 100 MiB output ceiling, 32 KiB writes, no-replace publication and failed staging retention remain. Static inputs are size-checked before bounded stream reads; SDK/native/browser peak memory is not established.
3. Blog/project printable providers join blog/project/deck OG providers on the shared file-only provider. Controllers prepare textual HTML/CSS; referenced assets use owned downloads, deduplicated within a closed builder scope (at most 16 references). All admitted reference work joins; failed input staging is retained. Controller PDF SDK injection and the data-URL helper are removed. PDF printing preserves CSS page sizing, backgrounds and its existing 25 MiB ceiling within the global 100 MiB limit; the actor also checks the PDF signature.
4. `SourceImageRenderJobHandler` consumes the borrowed PNG, compares actor inspection against the attachment's required SHA-256/size/MIME receipt, and publishes through `saveProcessedEntity({ fileAsset, signal })`. No buffered resolution or controller image preparation remains. Publication/reuse guards survive provider cleanup, uncertain publication and admitted target failures; cancellation before target admission returns an explicit warning without retracting the image.

**Exit check:** the existing canonical worker App still exercises the real OG source-render job, native publication and authenticated restart downloads. Its existing owner App now exercises the registered printable provider, real Bun PDF rendering and independent actor/native full-byte fingerprint verification. Controller buffered reads/resolution are forbidden. Serial PNG then PDF exceeded five seconds; the independent owner PDF and worker PNG flows now join concurrently, with each existing runtime retaining its one-producer/two-child limit and the same shared persistence budget. Three runs passed at 3.97/4.33/4.08 seconds with the default timeout unchanged. 81 focused tests cover both formats, malformed/oversized/symlinked instructions, PDF limits/signature/cancellation, borrowed staging and existing publication guards.

**Scope:** blog/project printable providers are migrated, not deck carousel or publishing/chat/social attachment consumers. The canonical PDF is verified within its borrowed lifetime, not published as a durable document. Bun actor exit is acknowledged; WebView descendant shutdown is requested, not independently acknowledged. Descendant recovery and peak-memory proof remain release-hardening work, not a prerequisite Chromium-factory project.

**Next slice:** migrate the deck carousel PDF provider while preserving dynamic theme selection and slide limits, then its file-consuming publishing path. AI generation, site image processing, other publishing/chat/social attachment consumers and upstream upload capture remain pending. Package/default application provisioning remains milestone 3; do not switch the runtime factory until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
