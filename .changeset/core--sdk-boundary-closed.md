---
"@brains/sdk": minor
"@brains/admin": patch
"@brains/dashboard": patch
"@brains/email-workflows": patch
"@brains/site-builder-plugin": patch
"@brains/site-content": patch
"@brains/studio": patch
"@brains/unified-inbox": patch
"@brains/chat-repl": patch
---

Every package under `plugins/` and `interfaces/` now imports the plugin runtime through the SDK alone. Eight packages still reached into `@brains/plugins` for a symbol or two after their conversion; each symbol is now admitted on the SDK with the package as its named consumer, or replaced by what the declared surface already offered.

- Admitted on `@brains/sdk/services`: the operator block and binding types a workspace declaration is written against (`OperatorColumnsBlock`, `OperatorPanelBlock`, `BoundWorkspaceAction`, `OperatorBindingContext`), the inbox follow-up namespace type, and the route helpers `jsonResponse` and `jsonError`.
- Admitted on `@brains/sdk/entities`: the inbox item, source and facet schemas and types, the data source declaration types, and `DataSource`.
- Replaced: unified-inbox's picks of the runtime's inbox registries are the inbox namespaces the setup context hands it; site-builder's feed writer reads through the same entity reads as the rest of its pipeline; chat-repl's unused batch-progress component, the only reader of the raw queue's batch status, is gone.

A dependency-cruiser rule keeps it so: source under `plugins/` or `interfaces/` may not import from `shell/plugins`.
