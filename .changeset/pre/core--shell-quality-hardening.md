---
"@brains/core": patch
"@brains/mcp-service": patch
"@brains/messaging-service": patch
"@brains/plugins": patch
"@brains/job-queue": patch
"@brains/runtime-state": patch
"@brains/utils": patch
"@rizom/brain": patch
---

Harden shell registration, acknowledgement barriers, and resource teardown:

- Reject duplicate MCP capabilities without overwriting their owners, and propagate registration failures for plugin rollback.
- Retain failed message collection acknowledgements so successful subscribers cannot hide a failed projection-wave completion effect.
- Reject scoped plugin acquisition before registry mutation and keep attachment release handles bound to their own registrations.
- Drain admitted durable progress polling before runtime teardown; progress monitor stop is now terminal and Promise-based.
- Clear runtime-state prefixes atomically without parsing stale values, preserving literal wildcard, Unicode, and embedded-NUL matching.
- Separate operator runtime contracts, schemas, action normalization, block normalization, and diagnostics into private responsibility-owned modules without changing rendered output.
