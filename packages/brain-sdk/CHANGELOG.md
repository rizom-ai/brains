# @brains/sdk

## 0.2.0-alpha.642

### Patch Changes

- [#833](https://github.com/rizom-ai/brains/pull/833) [`53da557`](https://github.com/rizom-ai/brains/commit/53da557991ad676545a4674600f0aca4c00fa1ba) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `defineEntity` now accepts `instructions`, `agentContext`, `scheduledGeneration` and `evals`, and `@rizom/brain/entities` exports `EntityAgentContextProvider`, `EntityScheduledGenerationDeclaration`, `EntityEvalDeclaration`, `EntityEvalContext` and `EntityEvalFixtures`. A declared type can tell the agent when to use it, ground the agent's turn with records the asker may see, answer the content pipeline's schedule by writing from one or all qualifying sources, and register evals with fixtures that seed, wait for embeddings and reset.

- [#833](https://github.com/rizom-ai/brains/pull/833) [`fa7dd0e`](https://github.com/rizom-ai/brains/commit/fa7dd0e07df1d9d4fd74c8e9d9255220a5cfb628) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `defineEntity` now accepts `create` routing and `attachments`, and `@rizom/brain/entities` exports `EntityCreateRouting`, `EntityCreateRoute`, `EntityCreateResolution`, `EntityCreateContext`, `EntityCreateUploadReader`, `EntityCreateAttachment`, `EntityCreateCheck`, `EntityAttachmentDeclaration`, `MediaAttachmentContext` and `AttachmentProvider`. A declared type decides how `system_create` treats uploads, attachments, content and prompts: it can check a request before the user confirms it, then create, reuse, update or refuse, and the runtime performs the write with the caller's visibility and attribution. A route can also claim upload media types from the upload endpoint. Declared attachment providers are built from a frozen, read-only media context that only reads public records, and `@brains/media-page-composer` providers accept that same context.

- [#833](https://github.com/rizom-ai/brains/pull/833) [`2e10c13`](https://github.com/rizom-ai/brains/commit/2e10c1388c32a44d301dbf115dd169a4328b5acf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `defineEntity` now accepts the basic entity slots and seeds, and `@rizom/brain/entities` exports `EntityDefinitionConfig`, `EntitySeedDefinition` and `EntitySeedTrigger`. A declared entity can set its entity-type settings through `config` (search, projection sourcing, binary storage, default sort, Markdown import, retired and translated fields, containment, its minimum action policy and publish statuses), migrate stored metadata with `metadataFrom`, be a `singleton`, declare `hasBody`, `coverImage` and a `displayTitle`, enforce a persistence invariant with `validatePersist`, set its own action rule with `actions`, and plant a default record with `seed` once startup content settles, never overwriting an existing one. The retired-field registration check now also applies to a type whose metadata schema migrates stored values.

- [#833](https://github.com/rizom-ai/brains/pull/833) [`386fc50`](https://github.com/rizom-ai/brains/commit/386fc505b04e29932e70cbda82171dacd915d494) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `defineEntity` now accepts `jobs`, `generation` and `stub`, create routes can allocate an entity and delegate to a declared job, and `@rizom/brain/entities` exports `defineEntityJob` with `AnyEntityJobDeclaration`, `EntityJobDeclaration`, `EntityGenerationDeclaration`, `EntityJobContext`, `EntityGenerationContext`, `EntityGenerationRequest`, `EntityGenerationResult`, `EntityGenerationLink`, `EntityCreateAllocation` and `EntityCreateDelegation`. A declared type can run its own durable jobs, generate entities through its own templates in the brain's voice, support `system_generate` with a placeholder stub, and link what it generated into another entity. A create route can write a placeholder and hand its id to a generating job, which fills it in or marks it failed.

- [#833](https://github.com/rizom-ai/brains/pull/833) [`821fdf7`](https://github.com/rizom-ai/brains/commit/821fdf7451ec6fb80ff3cd70d7164cd672aee288) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `defineEntity` now accepts `templates` and `feed`, `defineEntityPackage` accepts `dataSources`, and `@rizom/brain/entities` exports `defineDataSource`, `DataSourceDefinition`, `DataSourceEntityReader`, `EntityDataSourceDefinition`, `EntityFeedDeclaration` and `FeedItem`. A data source either fetches through reads typed by the definitions it names, or lists and shows one declared entity type, with the runtime deriving that type's schema from its definition and handling ordering, paging, filtering, lookup and neighbors. Data source ids are scoped to the package, and templates follow a package data source to its scoped id. A declared feed is written as RSS into every site build, with every record in a preview and only published ones in production, and a malformed item fails the build. Blog RSS feeds no longer break when a post's body contains `]]>`.
- Updated dependencies [[`53da557`](https://github.com/rizom-ai/brains/commit/53da557991ad676545a4674600f0aca4c00fa1ba), [`fa7dd0e`](https://github.com/rizom-ai/brains/commit/fa7dd0e07df1d9d4fd74c8e9d9255220a5cfb628), [`2e10c13`](https://github.com/rizom-ai/brains/commit/2e10c1388c32a44d301dbf115dd169a4328b5acf), [`72403d7`](https://github.com/rizom-ai/brains/commit/72403d7d7ff7422f0a59db708955c267225ab7a3), [`386fc50`](https://github.com/rizom-ai/brains/commit/386fc505b04e29932e70cbda82171dacd915d494), [`821fdf7`](https://github.com/rizom-ai/brains/commit/821fdf7451ec6fb80ff3cd70d7164cd672aee288)]:
  - @brains/plugins@0.2.0-alpha.642
  - @brains/entity-service@0.2.0-alpha.642
  - @brains/contracts@0.2.0-alpha.642
  - @brains/utils@0.2.0-alpha.642
  - @brains/templates@0.2.0-alpha.642

## 0.2.0-alpha.641

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.641
  - @brains/utils@0.2.0-alpha.641
  - @brains/entity-service@0.2.0-alpha.641
  - @brains/plugins@0.2.0-alpha.641
  - @brains/templates@0.2.0-alpha.641

## 0.2.0-alpha.640

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.640
  - @brains/utils@0.2.0-alpha.640
  - @brains/entity-service@0.2.0-alpha.640
  - @brains/plugins@0.2.0-alpha.640
  - @brains/templates@0.2.0-alpha.640

## 0.2.0-alpha.639

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.639
  - @brains/utils@0.2.0-alpha.639
  - @brains/entity-service@0.2.0-alpha.639
  - @brains/plugins@0.2.0-alpha.639
  - @brains/templates@0.2.0-alpha.639

## 0.2.0-alpha.638

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.638
  - @brains/utils@0.2.0-alpha.638
  - @brains/entity-service@0.2.0-alpha.638
  - @brains/plugins@0.2.0-alpha.638
  - @brains/templates@0.2.0-alpha.638

## 0.2.0-alpha.637

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.637
  - @brains/utils@0.2.0-alpha.637
  - @brains/entity-service@0.2.0-alpha.637
  - @brains/plugins@0.2.0-alpha.637
  - @brains/templates@0.2.0-alpha.637

## 0.2.0-alpha.636

### Patch Changes

- [#831](https://github.com/rizom-ai/brains/pull/831) [`11b7280`](https://github.com/rizom-ai/brains/commit/11b72805aacd377e1ea1db3b36109c57c541eca5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The authoring surface moves into a new `@brains/sdk` package, and the `@rizom/brain`, `/plugins`, `/entities`, `/services`, `/interfaces` and `/templates` entries re-export it. The published surface is unchanged. `defineBrain`, `defineBundle`, `use` and the brain-definition contract move from `@brains/app` into the SDK, and `reasoningEffortSchema` now lives once in `@brains/contracts`.
- Updated dependencies [[`11b7280`](https://github.com/rizom-ai/brains/commit/11b72805aacd377e1ea1db3b36109c57c541eca5)]:
  - @brains/contracts@0.2.0-alpha.636
  - @brains/entity-service@0.2.0-alpha.636
  - @brains/plugins@0.2.0-alpha.636
  - @brains/templates@0.2.0-alpha.636
  - @brains/utils@0.2.0-alpha.636
