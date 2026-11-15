---
"@rizom/brain": patch
---

A package shares a runtime-state record with other packages by declaring it with `defineSharedState("<package name>:<name>", schema)` from `@rizom/brain/services` and opening it with its setup's `runtimeState(state)`; registration refuses a record another package names. A fetching data source reads such a record with `context.sharedState(state).get(key)`, and another package's data source with `context.dataSources.fetch("<package name>:<local id>", query, schema)`, at the calling build's reads (only published records in a production build), null when no installed package serves it, and refused when the read would come back to a source the build is already reading. `SharedState` and `SharedStateReader` are the types.
