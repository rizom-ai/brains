---
"@brains/ai-service": patch
"@brains/core": patch
"@brains/discord": patch
"@brains/job-queue": patch
"@brains/plugins": patch
"@brains/recurring-checks": patch
---

Make shell, daemon, worker, plugin, recurring-check, Discord-handler, and conversation teardown transitions joinable and terminal; stop active agent work before plugin teardown; and prevent queued work from entering after shutdown.
