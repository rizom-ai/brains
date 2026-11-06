---
"@brains/sdk": patch
"@brains/app": patch
"@brains/contracts": patch
"@brains/core": patch
"@rizom/brain": patch
---

The authoring surface moves into a new `@brains/sdk` package, and the `@rizom/brain`, `/plugins`, `/entities`, `/services`, `/interfaces` and `/templates` entries re-export it. The published surface is unchanged. `defineBrain`, `defineBundle`, `use` and the brain-definition contract move from `@brains/app` into the SDK, and `reasoningEffortSchema` now lives once in `@brains/contracts`.
