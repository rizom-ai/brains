---
"@brains/app": patch
"@brains/ai-evaluation": patch
"@brains/core": patch
"@brains/ai-service": patch
"@brains/utils": patch
"@brains/entity-service": patch
"@brains/job-queue": patch
"@brains/mcp-service": patch
"@brains/plugins": patch
"@brains/runtime-state": patch
"@brains/mcp": patch
"@brains/web-chat": patch
---

Harden shell lifecycle ownership with a centralized `@brains/utils/effect` boundary, scoped job-service layers, supervised fibers, deterministic schedules, transactional startup rollback, terminal plugin teardown, graceful job draining, daemon rollback, and end-to-end `AbortSignal` cancellation for AI requests and agent turns. Build public package subpaths with shared chunks to avoid duplicating their runtime code.
