---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`defineEntity` now accepts `jobs`, `generation` and `stub`, create routes can allocate an entity and delegate to a declared job, and `@rizom/brain/entities` exports `defineEntityJob` with `AnyEntityJobDeclaration`, `EntityJobDeclaration`, `EntityGenerationDeclaration`, `EntityJobContext`, `EntityGenerationContext`, `EntityGenerationRequest`, `EntityGenerationResult`, `EntityGenerationLink`, `EntityCreateAllocation` and `EntityCreateDelegation`. A declared type can run its own durable jobs, generate entities through its own templates in the brain's voice, support `system_generate` with a placeholder stub, and link what it generated into another entity. A create route can write a placeholder and hand its id to a generating job, which fills it in or marks it failed.
