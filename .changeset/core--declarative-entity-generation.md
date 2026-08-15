---
"@brains/plugins": minor
"@brains/sdk": minor
---

Add declarative content generation to the entity surface. An entity may declare `generation` as an input schema plus one `handle` function; the runtime registers it as the `{entityType}:generation` job and validates job input against the schema before the author's code runs.

The handler receives a narrowed context — AI generation, a logger contract, and entity list/get/update/getEntityTypes — rather than the plugin context, so nothing about the entity service crosses the published declaration boundary. Eight entity packages currently override `createGenerationHandler` to build this by hand.
