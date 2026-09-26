---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/atproto-contracts": patch
---

Add the last two capabilities an entity derived from many sources needs: `projectionRules`, for entities projected from every other type rather than from one named source, and `atproto`, an AT Protocol projection the runtime registers and releases on shutdown.

Two more `Pick`s of runtime services became structural interfaces so they can cross the published declaration boundary: `ProjectionEntityReader` (was a `Pick` of the entity service) and `AtprotoProjectionContext.entityService`, which is now the two methods projections actually use — its doc comment already said projections "only read and update entities". `ProjectionExecutionContext.logger` moves to `LoggerContract`.

The narrow entity reader's methods are renamed to `listEntities`/`getEntity`/`getEntityTypes`, matching the entity service, so migrating a package off the plugin context is a swap of the object rather than a rewrite of every call.
