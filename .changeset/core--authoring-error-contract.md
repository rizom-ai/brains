---
"@brains/contracts": minor
"@brains/core": patch
"@brains/sdk": minor
"@brains/plugins": minor
"@brains/job-queue": minor
"@brains/mcp-service": minor
"@brains/messaging-service": minor
"@brains/templates": patch
"@brains/chat": patch
"@brains/web-chat": patch
"@brains/studio": patch
"@brains/playbooks": patch
"@brains/site-content": patch
"@brains/newsletter": patch
"@brains/unified-inbox": patch
"@brains/analytics": patch
"@brains/agent-discovery": patch
"@brains/a2a": patch
"@brains/directory-sync": patch
"@rizom/brain": minor
---

Expose one schema-backed SDK error code vocabulary and a serializable SdkError
class across the authoring entries. Consolidate the message-only and upload
error names rather than maintaining parallel public families. Allow explicit,
bounded public messages for known application refusals while keeping diagnostic
messages private. Classify state conflicts separately from invalid inputs.

Preserve codes through declared tools, typed requests, HTTP route failures,
MCP response normalization, and durable job status. Store safe job failure text
and its code, clear both on completion, and sanitize old or unknown stored codes
at public status readers. Keep diagnostic messages, causes, stacks, and private
request data out of runtime-generated failure responses. Batch status and progress
now carry shared error records instead of raw diagnostic strings, including safe
fallbacks for missing children and legacy rows with no diagnostic. Remove the
unused internal batch-data schema.

Treat schema-valid declared job refusals as domain data, while native handlers
retain controlled-failure semantics. Preserve each attempt's prepared input for
its error and terminal callbacks instead of reparsing transforms and defaults.
Classify malformed durable JSON as invalid input.

Add cross-copy serialization, public authoring, real HTTP, and SQLite worker /
restart regressions. Preserve approval and explicit protocol response envelopes,
including intentional native-tool refusals; sanitize exceptions where the runtime
catches them instead of rewriting those domain responses.
