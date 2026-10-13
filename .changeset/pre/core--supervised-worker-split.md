---
"@brains/app": patch
"@brains/core": patch
"@brains/directory-sync": patch
"@brains/job-queue": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

Split the bundled runtime into supervised web and durable execution children, with immutable handler inventory, execution-only plugin registration, web-owned enqueue validation, and budgeted worker restart isolation.
