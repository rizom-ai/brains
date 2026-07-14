---
"@brains/cms": patch
---

Move CMS entity-list and entity-detail server state into a package-local TanStack Query cache. Saves now use a mutation hook while drafts remain pinned to their opened content hash, with targeted invalidation and request-deduplication coverage.
