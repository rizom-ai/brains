---
"@brains/core": patch
"@brains/entity-service": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Activate the shared Groupings document after contributor registration. Derive Studio labels, contributor descriptors and all four open/closed and one/several membership modes from its source. Refresh current rules after refused saves without discarding local drafts.

Reject the removed Studio `groupings` configuration and competing static declarations. Remove the vocabulary entity and runtime readers, and update canonical permissions to `grouping-definitions`. There is no compatibility reader, alias, dual write or startup conversion. Existing installations require a separately reviewed, backed-up and fenced one-time conversion of configuration, applicable per-type permissions and content before upgrading; this change does not perform it.

Check schema-admitted entities when probing field-tool persistence. Source-only definition fields must not appear to save when validation would strip them: use full Markdown replacement instead. Cover source activation through real plugin/session/editor integration and the exact packed Brain CLI, including refused writes and unchanged drafts/source. Authenticated running-app and migration acceptance remain separate.
