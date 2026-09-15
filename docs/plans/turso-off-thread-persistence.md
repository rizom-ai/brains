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

## Current slice: directory-sync inline/frontmatter URL images — complete

1. Extend the existing worker-App scenario with registered inline conversion and frontmatter conversion; forbid controller fetches before implementation.
2. Share source-URL deduplication, actor metadata inspection and native file publication across cover, inline and frontmatter callers. Remove their base64-fetcher injection paths; test fixtures stay test-only.
3. Propagate cancellation through lookup and file handoffs. Inline jobs stop before another image or document write; acknowledged publication is not retracted. Preserve ordinary per-image failure handling.
4. Reuse one URL in canonical coverage: the cover job exercises shared native creation, then inline/frontmatter exercise reuse. Assert exactly one HTTP request; add no actors or startup beyond the previous slice.

**Exit check:** focused caller/cancellation tests and the canonical source integration pass under the default timeout. HTTP behavior, budgets, failed staging, native verification and actor lifetime remain supplied by the existing file capability. Logical quotas do not establish HTTP/TLS/zlib/kernel/GC/RSS bounds. Runtime factory and default/installed actor provisioning remain unchanged.

**Next slice:** migrate stock-photo selection's buffered image download onto the same file capability. Package/default application provisioning remains milestone 3; do not switch the runtime factory until milestone 2's exit check passes.

Keep the 100 MiB ceiling, 32 KiB data-plane credits, existing RPC/SQL/admission limits, entity/asset/reference/projection/outbox atomicity, primary/cleanup causes and actual-exit acknowledgement. Preserve failed recovery directories. If a fault matrix is needed, name the application integration blocker first.
