---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Reproject added grouping type/field pairs after definition writes, using the existing bounded metadata-only scan. Keep pending work and readiness entirely in memory: Studio returns initializing during scans, failed scans remain retryable without misreporting saved definitions, and startup reconstructs progress from source.

Guard ordinary entity commits against a definition change after preparation. Stale writes, including no-op updates, are refused for retry before committing source or exports, using an in-memory publication revision and the existing write transaction.

Independent processes conservatively verify their own projections on observed definition changes, including remove/re-add cycles detected through existing document timestamps. No database tables, migrations or persistent status records are added. The new definitions registration module remains an internal implementation checkpoint, not yet activated by StudioPlugin.
