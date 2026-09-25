---
"@brains/db": patch
---

Report verified native HTTP receipts before transport/source retirement using a separate bounded received phase. Require matching terminal completion and actual process exit before success. Preserve received evidence through later actor failures, missing completion, conflicting messages and shutdown without replay or early admission release.
