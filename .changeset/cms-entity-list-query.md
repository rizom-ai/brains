---
"@brains/cms": patch
---

Move CMS navigation, optional workspace, entity, schema, sync-status, and agent-target server state into a package-local TanStack Query cache. Saves, deletes, image uploads, and workspace actions now use mutation hooks, while a typed reducer coordinates editor workflows and keeps drafts pinned to their opened content hash with targeted invalidation and request-count coverage.
