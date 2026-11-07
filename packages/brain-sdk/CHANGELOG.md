# @brains/sdk

## 0.2.0-alpha.647

### Patch Changes

- [#846](https://github.com/rizom-ai/brains/pull/846) [`5be493b`](https://github.com/rizom-ai/brains/commit/5be493b073fdffbfa34d0e7cbb5c56b3755d4710) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A service reads its own account settings for the current caller with `accountSettings.read()`, in its tools and routes and in every operator callback, loaders and `prepare` included: the caller's own settings, or `null` for a caller without an account or one who has none. Each field the definition marks `secret` comes back as an `AccountSettingsSecret`, whose `reveal()` returns the value and whose `toJSON()`, `toString()`, interpolation and inspection give `[secret]`, so a secret placed by accident in view data, a route answer, a tool result or a log line leaves as the marker. Writes stay with `execute`, tools and routes, and an operator callback's `settings` stays redacted.

- [#846](https://github.com/rizom-ai/brains/pull/846) [`881a78d`](https://github.com/rizom-ai/brains/commit/881a78d94b08a4118f9b48adb5df7af50b275476) Thanks [@yeehaa123](https://github.com/yeehaa123)! - An operator surface acts as its caller. Its callbacks read through an `EntityReader` (`get`, `list` with paging and sort, `count`) at the caller's visibility, in place of `OperatorEntityReader`, whose `search` had no consumer. Inside a service, every operator callback runs as the operator or viewer who called it, so a slot's `entities` captured elsewhere reads and writes as them too, never as the package. A workspace action's `execute` writes the service's own entity types through its `entities`, attributed to the operator and held to the action policy.
- Updated dependencies [[`5be493b`](https://github.com/rizom-ai/brains/commit/5be493b073fdffbfa34d0e7cbb5c56b3755d4710), [`881a78d`](https://github.com/rizom-ai/brains/commit/881a78d94b08a4118f9b48adb5df7af50b275476), [`52e956e`](https://github.com/rizom-ai/brains/commit/52e956e691d81534c8b95fcbc944ec9bc5c08f57), [`a2e7db7`](https://github.com/rizom-ai/brains/commit/a2e7db724ee73b295aab8270caf39559ca462242), [`8a8ff2b`](https://github.com/rizom-ai/brains/commit/8a8ff2b51b74e71441aeebff7057a768152fc0de), [`468104b`](https://github.com/rizom-ai/brains/commit/468104beef91e82a3635e582396ee4d3f0d0d47b)]:
  - @brains/plugins@0.2.0-alpha.647
  - @brains/contracts@0.2.0-alpha.647
  - @brains/utils@0.2.0-alpha.647
  - @brains/entity-service@0.2.0-alpha.647
  - @brains/templates@0.2.0-alpha.647

## 0.2.0-alpha.646

### Patch Changes

- [#845](https://github.com/rizom-ai/brains/pull/845) [`d17741e`](https://github.com/rizom-ai/brains/commit/d17741ee9a90fe7a93ee10aed0fcb7e3d326a620) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A declared route's handler answers with its response schema's input, for a service's routes and an interface's alike: written inline, an answer keeps its literal types, so an enum value needs no cast, and an answer the schema does not accept is refused by the types as well as by the runtime. `@rizom/brain/interfaces` exports `SdkError`, so an interface route throws a coded failure that is answered in its public form, `{ error, code }`, with the status its code names.

- [#845](https://github.com/rizom-ai/brains/pull/845) [`8429386`](https://github.com/rizom-ai/brains/commit/84293863b22d4be8a5cf1ac2341fd28bd13d8573) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `@rizom/brain/interfaces` exports `defineMessageInterfacePackage({ id, config, interfaces })`: one package that runs several message interfaces chosen from one config. `interfaces({ config })` returns the `defineMessageInterface` definitions the parsed config enables, each its own plugin with its own channel under the package, which owns their runtime state. Every interface is declared over the package's config schema; one declared over another schema, one that is not a message interface, an id declared twice and a package nested in another are refused.
- Updated dependencies [[`d17741e`](https://github.com/rizom-ai/brains/commit/d17741ee9a90fe7a93ee10aed0fcb7e3d326a620), [`e2c6e83`](https://github.com/rizom-ai/brains/commit/e2c6e8328fb9ba84dfed78bd63933ed33efd50b0), [`74f58e6`](https://github.com/rizom-ai/brains/commit/74f58e6a99d1b60d5323a0da623db98a43a8a8ff), [`8429386`](https://github.com/rizom-ai/brains/commit/84293863b22d4be8a5cf1ac2341fd28bd13d8573), [`0e95b92`](https://github.com/rizom-ai/brains/commit/0e95b92f0a40a3b0943d8650c77321431a04b5e9)]:
  - @brains/plugins@0.2.0-alpha.646
  - @brains/contracts@0.2.0-alpha.646
  - @brains/utils@0.2.0-alpha.646
  - @brains/entity-service@0.2.0-alpha.646
  - @brains/templates@0.2.0-alpha.646

## 0.2.0-alpha.645

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.645
  - @brains/utils@0.2.0-alpha.645
  - @brains/entity-service@0.2.0-alpha.645
  - @brains/plugins@0.2.0-alpha.645
  - @brains/templates@0.2.0-alpha.645

## 0.2.0-alpha.644

### Patch Changes

- [#840](https://github.com/rizom-ai/brains/pull/840) [`8d9a2e1`](https://github.com/rizom-ai/brains/commit/8d9a2e1dcd4135d25c71763af4d5587e9e825c98) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A durable job's failure is recorded in its public form, the `SdkError` data `{ code, message }`, beside the diagnostic message, in a new `lastErrorPublic` column. `jobs.status()` on a service job reports that `code` and, as `error`, its public message: an `SdkError`'s `publicMessage` when it was given one, else the code's standard message, never the message a failure was thrown with, so a status reader never sees what a handler meant only for operators. A failure recorded without a valid public form reads as `handler_failed`. A thrown `SdkError` keeps its code, any other error is `handler_failed`, an answer outside the job's output schema is `invalid_response`, a requester whose account is gone is `permission_denied`, a job no package handles is `no_handler`, a superseded one `cancelled`, and an expired attempt `deadline_exceeded`.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`fbee77b`](https://github.com/rizom-ai/brains/commit/fbee77b9444be83e8f1282a249430da4c907ced7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A generation's `linkInto` on a declared target is refused before anything is saved when the target's metadata does not declare the linked field or list, or cannot hold the link. A declared type's metadata is its frontmatter, so such a link was stored where no read reached it.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`309fed6`](https://github.com/rizom-ai/brains/commit/309fed693c3ae04ad23a279d06bca8058c1d480b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A definition-typed record is read as stored: its body decoded by the type's codec, with image references left as `entity://image/{id}` references instead of resolved to the image's data. `EntityReader.get` used to resolve them while `list` did not, so the two returned different content for one record, and a record read and written back, through an Inbox action, a create route's update or a service's owned writes, could store the image's data in place of its reference. A record written back unchanged is now stored byte for byte. A generation's `linkInto` on a declared target now reads and writes the target's metadata, which is its frontmatter, instead of the body, so extending a list keeps the entries already on it. The read-only entity service that analytics reports are given gains `getEntityRaw`.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`c33189f`](https://github.com/rizom-ai/brains/commit/c33189f0b2527fbf7419a17fca015ff418652639) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `@rizom/brain/entities` exports the definition-typed reader as `EntityReader` instead of `DataSourceEntityReader`. It is the reader every context that reads entities is given (data sources, checks, evals, the Inbox, analytics reports and AT Protocol projections), not one particular to data sources. The old name is gone.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`a7178d0`](https://github.com/rizom-ai/brains/commit/a7178d0d135ba4222d8d5c62736786550e1e0403) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A service serves HTTP routes. The `routes` slot returns routes declared with `defineRoute` and `protocol`, now also exported from `@rizom/brain/services`, and is given `entities`, `jobs` and `messaging`, which inside a route act as its caller: the signed caller of a protocol route, or nobody in particular on a public one, and a job a route starts is admitted as that caller. Services and interfaces serve declared routes through one runtime, which answers a failure in its public form, `{ error, code }`, with the status its code names: `unauthenticated` (401) for an unsigned protocol call, `invalid_input` (400) for a body that is not JSON or that its schema refuses, a handler's `SdkError` with its own code, `handler_failed` (500) for any other error and `invalid_response` (500) for an answer outside the response schema. The diagnostic stays in the declaring package's log.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`8e4928d`](https://github.com/rizom-ai/brains/commit/8e4928d751ff6addabfbb4b463e20dcc5543aa06) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A service declares the entity types it owns in its header's `entities`, and each is installed with the package. The `jobs` and `tools` slots are given one `entities`: definition-typed reads (`EntityReader`) and writes to the owned types (`OwnedEntityWriter`: `create`, `update` and `delete`), both exported from `@rizom/brain/services`. It acts as the current caller: the tool's caller inside a tool, the job's requester inside a running job, and the package's own grant anywhere else. Writes are attributed to that caller and held to the type's action policy at its permission level; a `never` rule closes a type to system tools, not to its owner. A definition the header does not own is refused by the types and at runtime, an id taken at any visibility is refused, and an update or delete of a record the caller cannot see, or one that changed after it was read, is refused. A job handler's context no longer carries an `entities` reader of its own.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`04b829a`](https://github.com/rizom-ai/brains/commit/04b829a4586ac2cf75a0e48d7175e73307346c30) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A service answers other packages over the bus by contract. `defineBusContract({ channel, request, response, delivery })` is public from `@rizom/brain/services`, the brain's own contract narrowed to `request` and `command`; gathering stays inside the brain. The `subscriptions` slot returns `answer(contract, handler)` bindings, contract first, whose handler gets the parsed `request`, the `sender` and `entities` acting as the package; an answer keeps the literals it is written with, is checked against the response schema, and is released when the package shuts down. A channel answered twice, or a contract delivered any other way, is refused. The `tools` and `subscriptions` slots, and a job's handler beside `publish`, ask with `messaging.request(contract, request)`, which returns a `BusResult` whose failure is in its public form, and send with `messaging.command(contract, request)`. `BusContract` and `BusResult` are public types.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`4a8d3c7`](https://github.com/rizom-ai/brains/commit/4a8d3c708b793f738f7fb95d29b7d9254ccacee6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A literal returned inline from a `defineTool` `execute` keeps its literal type, with or without parameters, so an enum value in the output no longer needs a cast. A tool's `confirmation` may be a function of its parsed input. A service tool's failure reaches its caller in its public form, `{ success: false, code, error }`: an `SdkError`'s code and `publicMessage`, or else the code's standard message, never the message a failure was thrown with, which stays in the brain's debug log. Refused input is `invalid_input`, and its message names each offending path and why, as main's class tools always have, cut between whole issues to the 1024-character public bound; another error from `execute` is `handler_failed`, an answer outside the output schema is `invalid_response`, and a call whose caller has gone is `cancelled`. Content-generation limits keep their message as `invalid_input`.

- [#840](https://github.com/rizom-ai/brains/pull/840) [`4f8e07e`](https://github.com/rizom-ai/brains/commit/4f8e07ea9afdd7aea384403373287698ae4371e0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `defineServicePlugin` now takes two arguments: a header with the package's `id`, `config`, `accountSettings` and `setup`, and the behavior that reads the state `setup` returns, whose slots may be written in any order; a behavior slot written into the header is refused. `setup` is given `runtimeState({ namespace, schema })`, a store qualified by the owning package so two packages naming the same namespace never share a record. `@rizom/brain/services` exports `SdkError`, `SdkErrorCode`, `SdkErrorData`, `sdkErrorCodeSchema` and `sdkErrorSchema`: a coded failure whose code survives every boundary and whose diagnostic message stays local. Runtime state now stores the schema's input and parses it at every read, so a transforming schema no longer fails on a stored value; a value that does not survive a JSON round trip is refused before it is written, and `compareAndSet` compares the expected value with the stored value as read, answering `false` rather than throwing for one the schema would refuse. Namespaces may be up to 512 characters, and a scoped store is a frozen handle that exposes no storage internals.
- Updated dependencies [[`916c62b`](https://github.com/rizom-ai/brains/commit/916c62b52017fe7c34a1ee46bd7d07f3d3d28763), [`8d9a2e1`](https://github.com/rizom-ai/brains/commit/8d9a2e1dcd4135d25c71763af4d5587e9e825c98), [`fbee77b`](https://github.com/rizom-ai/brains/commit/fbee77b9444be83e8f1282a249430da4c907ced7), [`309fed6`](https://github.com/rizom-ai/brains/commit/309fed693c3ae04ad23a279d06bca8058c1d480b), [`c33189f`](https://github.com/rizom-ai/brains/commit/c33189f0b2527fbf7419a17fca015ff418652639), [`d697803`](https://github.com/rizom-ai/brains/commit/d697803dd88bad270aeca682009b91e3ba678fcd), [`ec7c939`](https://github.com/rizom-ai/brains/commit/ec7c939a4b4389478ac4b0fe0fc7c73347356db1), [`29ac442`](https://github.com/rizom-ai/brains/commit/29ac442e4f090c25f28b1e87228a2a5fb8f467bc), [`7963f25`](https://github.com/rizom-ai/brains/commit/7963f256c4c11009fd333643bffc805a0e9119d8), [`e18c7c2`](https://github.com/rizom-ai/brains/commit/e18c7c25309f4c489f295c00890d6af9a61828e9), [`a7178d0`](https://github.com/rizom-ai/brains/commit/a7178d0d135ba4222d8d5c62736786550e1e0403), [`8e4928d`](https://github.com/rizom-ai/brains/commit/8e4928d751ff6addabfbb4b463e20dcc5543aa06), [`2302529`](https://github.com/rizom-ai/brains/commit/230252986476b8752489a681a87da122ebd6eb51), [`04b829a`](https://github.com/rizom-ai/brains/commit/04b829a4586ac2cf75a0e48d7175e73307346c30), [`4a8d3c7`](https://github.com/rizom-ai/brains/commit/4a8d3c708b793f738f7fb95d29b7d9254ccacee6), [`4f8e07e`](https://github.com/rizom-ai/brains/commit/4f8e07ea9afdd7aea384403373287698ae4371e0), [`b46228c`](https://github.com/rizom-ai/brains/commit/b46228cfa648da9e988fe4e66ad1c21876fcd135)]:
  - @brains/contracts@0.2.0-alpha.644
  - @brains/plugins@0.2.0-alpha.644
  - @brains/entity-service@0.2.0-alpha.644
  - @brains/utils@0.2.0-alpha.644
  - @brains/templates@0.2.0-alpha.644

## 0.2.0-alpha.643

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.643
  - @brains/utils@0.2.0-alpha.643
  - @brains/entity-service@0.2.0-alpha.643
  - @brains/plugins@0.2.0-alpha.643
  - @brains/templates@0.2.0-alpha.643

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
