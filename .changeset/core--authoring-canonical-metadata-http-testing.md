---
"@brains/utils": patch
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
"@brains/agent-discovery": patch
"@brains/playbooks": patch
"@brains/email-workflows": patch
---

Require canonical stored metadata schemas and reject explicit rewriting pipelines and checks early with actionable diagnostics. Validate metadata once per definition-typed parse, and keep Skill, Playbook, and Email Reply Draft normalization at their input/import boundaries. Cover real persistence, reopen, and update round trips. Make the public harness validate before storage too, so defaults are materialized once and canonical metadata is observable before any typed read.

Add `BrainTestHarness.fetchResponse()` for unconsumed HTTP status, headers, and body assertions while retaining the distinct JSON-data convenience of `fetch()`. Correct local template-name documentation and verify the author's literal minimal package/compiler configuration in an isolated packed install, including explicit Node ambient types for TypeScript 7.
