---
"@brains/cms": patch
---

Move CMS entity, type, schema, sync-status, and agent-target server state into a package-local TanStack Query cache. Saves, deletes, and image uploads now use mutation hooks, while a typed reducer coordinates editor workflows and keeps drafts pinned to their opened content hash with targeted invalidation and request-count coverage.
