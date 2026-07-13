---
"@brains/core": patch
"@brains/ai-service": patch
"@brains/entity-service": patch
"@brains/job-queue": patch
"@brains/mcp-service": patch
"@brains/plugins": patch
"@brains/mcp": patch
"@brains/web-chat": patch
---

Harden shell lifecycle ownership with Effect scopes, supervised fibers, deterministic schedules, transactional startup rollback, graceful job draining, daemon rollback, and end-to-end `AbortSignal` cancellation for AI requests and agent turns.
