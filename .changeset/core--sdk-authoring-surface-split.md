---
"@rizom/brain": minor
---

Split the layer 1 authoring surface into its own workspace package so in-repo entity and plugin packages can consume the same contract external authors do. `@rizom/brain` now re-exports it, so every published specifier — `@rizom/brain`, `/plugins`, `/entities`, `/services`, `/interfaces`, `/templates` — resolves to identical symbols and no author-facing import changes. Previously the SDK and the canonical brain lived in one package, which made any in-repo package that depended on the SDK circular.

Adds to `@rizom/brain/entities`: an optional `config` slot on `defineEntity` (`embeddable`, `projectionSource`, `projectionSourceRole`, `weight`) for entity types that are system configuration rather than user content; an optional `seed` slot declaring a default entity created once a lifecycle trigger fires and only when no entity with that id exists; and the style guide contract (`fetchStyleGuide`, `styleGuideFromEntity`, the `format*` helpers and their schemas and types).

The style guide's structured data now lives in entity metadata rather than embedded in markdown content, read through `styleGuideFromEntity`. Entities written before this change degrade to the default guide rather than erroring and repopulate on the next directory-sync import.
