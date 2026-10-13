---
"@brains/plugins": patch
"@brains/messaging-service": patch
"@brains/dashboard": patch
"@rizom/brain": patch
---

Run public declarative Dashboard widgets through a host-owned runtime and semantic renderer. Providers receive canonical caller facts, secret-redacted current-account settings, visibility-scoped entity reads, typed jobs, and request/lifecycle cancellation; the runtime validates data and views, owns finalization, rollback, and shutdown, remains inert without Dashboard, and excludes execution-only workers.
