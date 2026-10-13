---
"@brains/core": patch
"@brains/entity-service": patch
"@brains/studio": patch
"@rizom/brain": patch
---

Activate the shared Groupings document after contributor registration. Derive Studio labels, contributor descriptors and all four open/closed and one/several membership modes from its source. Refresh current rules after refused saves without discarding local drafts.

Reject the removed Studio `groupings` configuration and competing static declarations. Remove the vocabulary entity and runtime readers, and update canonical permissions to `grouping-definitions`. There is no compatibility reader, alias, dual write or startup conversion. The old feature is used only on the smoke test site; its test setup will use the new document directly, without a legacy converter or conversion rehearsal.

Check schema-admitted entities when probing field-tool persistence. Source-only definition fields must not appear to save when validation would strip them: use full Markdown replacement instead. Cover source activation through real plugin/session/editor integration and the exact packed Brain CLI, including refused writes and unchanged drafts/source. Smoke deployment and running-app acceptance remain separate from this code change.
