# Public API `0.2`

This is the patch-stable public API ledger for the `0.2.x` line, covering
external authoring and headless browser contracts. A symbol is stable only when
it appears below. The machine-readable source is
[`export-ledger.json`](../../packages/brain-cli/test/fixtures/public-authoring/export-ledger.json).
Authoring packages beside that ledger and the separate packed headless Chat
consumer are the compatibility fixtures.

## `@rizom/brain`

Composition:

- `defineBrain`
- `defineBundle`
- `use`

Types:

- `BrainAnchorConfigKind`
- `BrainDefinition`
- `BrainIdentity`
- `BrainMode`
- `BundleConfigContribution`
- `BundlePermissionContribution`
- `CapabilityBundleDefinition`
- `ConfiguredPluginDefinition`
- `DeploymentConfigInput`
- `PermissionConfig`
- `PluginPackageDefinition`
- `ReasoningEffort`

## `@rizom/brain/chat`

Headless Chat domain and transport:

- `CHAT_API_VERSION`
- `DEFAULT_CHAT_API_PATH`
- `ChatApiError`
- `createChatApiPaths`
- `createChatClient`
- `readChatProtocolEvents`

Client and transport types:

- `ChatApiErrorKind`
- `ChatApiPaths`
- `ChatClient`
- `ChatClientOptions`
- `ChatFetch`

Domain types:

- `ArchiveChatSessionResponse`
- `ChatActionRequest`
- `ChatActionResponse`
- `ChatApprovalResponse`
- `ChatApprovalResponsePart`
- `ChatCard`
- `ChatContextHandoffRequest`
- `ChatContextHandoffResponse`
- `ChatEventAction`
- `ChatFilePart`
- `ChatHistoryAttachment`
- `ChatHistoryAttachmentSource`
- `ChatHistoryMessage`
- `ChatJobStatus`
- `ChatJobStatusValue`
- `ChatMessage`
- `ChatMessageRequest`
- `ChatMessageRole`
- `ChatMessagesResponse`
- `ChatProgressEvent`
- `ChatProtocolEvent`
- `ChatSession`
- `ChatSessionsResponse`
- `ChatTextPart`
- `ChatToolStatusEvent`
- `ChatToolStatusValue`
- `ChatUploadPart`
- `ChatUploadPartData`
- `ChatUploadRef`
- `ChatUploadResponse`
- `DeleteChatSessionResponse`
- `RenameChatSessionRequest`
- `RenameChatSessionResponse`

`ChatSession.contextHandoff` is optional bounded domain metadata. It contains
only the versioned source locator and title seed accepted by
`ChatContextHandoffRequest`; resolved source detail is never returned.

Schemas:

- `archiveChatSessionResponseSchema`
- `chatActionRequestSchema`
- `chatActionResponseSchema`
- `chatApprovalResponsePartSchema`
- `chatApprovalResponseSchema`
- `chatCardSchema`
- `chatContextHandoffRequestSchema`
- `chatContextHandoffResponseSchema`
- `chatEventActionSchema`
- `chatFilePartSchema`
- `chatHistoryAttachmentSchema`
- `chatHistoryAttachmentSourceSchema`
- `chatHistoryMessageSchema`
- `chatJobStatusSchema`
- `chatMessageRequestSchema`
- `chatMessageSchema`
- `chatMessagesResponseSchema`
- `chatProgressEventSchema`
- `chatProtocolEventSchema`
- `chatSessionSchema`
- `chatSessionsResponseSchema`
- `chatTextPartSchema`
- `chatToolStatusEventSchema`
- `chatUploadPartSchema`
- `chatUploadRefSchema`
- `chatUploadResponseSchema`
- `deleteChatSessionResponseSchema`
- `renameChatSessionRequestSchema`
- `renameChatSessionResponseSchema`

This subpath contains only server-owned domain state, protocol schemas, bounded
paths, and fetch-injected transport. Active selection, reducers, routing,
navigation, cache behavior, browser storage, UI-message transforms,
presentation copy, components, hooks, styles, and stores are not public API.

## `@rizom/brain/plugins`

Shared package-definition contract:

- `PluginPackageDefinition`

Every other export from this subpath remains an advanced consumer-backed alpha contract.

## `@rizom/brain/entities`

Definitions and schema vocabulary:

- `defineDataSource`
- `defineEntity`
- `defineEntityAnalyticsReport`
- `defineEntityJob`
- `defineEntityPackage`
- `ProjectionJsonObjectSchema`
- `defineProjection`
- `defineProjectionRule`
- `z`

Types:

- `AnyEntityJobDeclaration`
- `AtprotoBlobRef`
- `AtprotoLexicon`
- `AttachmentProvider`
- `DataSourceDefinition`
- `DataSourceEntityReader`
- `EncodedEntityMarkdown`
- `EntityAgentContextProvider`
- `EntityAnalyticsReportContext`
- `EntityAnalyticsReportDeclaration`
- `EntityAtprotoProjection`
- `EntityAtprotoPublishConfig`
- `EntityAtprotoRecordInput`
- `EntityAttachmentDeclaration`
- `EntityCreateAllocation`
- `EntityCreateAttachment`
- `EntityCreateCheck`
- `EntityCreateContext`
- `EntityCreateDelegation`
- `EntityCreateResolution`
- `EntityCreateRoute`
- `EntityCreateRouting`
- `EntityCreateUploadReader`
- `EntityDataSourceDefinition`
- `EntityDefinition`
- `EntityDefinitionConfig`
- `EntityEvalContext`
- `EntityEvalDeclaration`
- `EntityEvalFixtures`
- `EntityFeedDeclaration`
- `EntityGenerationContext`
- `EntityGenerationDeclaration`
- `EntityGenerationLink`
- `EntityGenerationRequest`
- `EntityGenerationResult`
- `EntityJobContext`
- `EntityJobDeclaration`
- `EntityMarkdownCodec`
- `EntityMarkdownDocument`
- `EntityOf`
- `EntityPackageDefinition`
- `EntityPublishAssetDeclaration`
- `EntityPublishDeclaration`
- `EntityScheduledGenerationDeclaration`
- `EntitySeedDefinition`
- `EntitySeedTrigger`
- `EntityTypeClassification`
- `FeedItem`
- `MediaAttachmentContext`
- `ProjectionDefinition`
- `ProjectionJsonObject`
- `ProjectionRule`
- `ProjectionRuleDefinition`
- `ProjectionWriteIntent`
- `PublishImageData`
- `PublishMediaData`
- `PublishProvider`
- `PublishResult`

`defineEntity` accepts plugin-owned `classification: "content" | "system"` (default `content`). Use `system` for operating instructions, identity, configuration and other brain machinery. System entities never participate in groupings; Studio consumes the classification rather than guessing from type names. Classification is registration metadata, not user-authored frontmatter or a permission/embedding/projection setting.

The runtime owns base entity fields, persistence, markdown validation, search indexing, projection scheduling, and worker execution.

`EntityDefinitionConfig` is the optional `config` slot on `defineEntity`: the entity-type settings a type may declare, validated when the package is installed and copied so later edits to the declaring object have no effect. Omitted keys keep the runtime defaults.

- `weight`, `embeddable`, `fullTextSearchable`, `includeInBroadSearch`, `projectionSource` and `projectionSourceRole` shape search and projection sourcing. System configuration typically opts out of embeddings and projection sourcing; `includeInBroadSearch: false` keeps derived answers out of searches that name no type, while a search naming the type still finds them.
- `binaryStorage: "data-url" | "asset"` declares a binary representation; absent means text content.
- `defaultSort` sets the default `system_list` order: at most ten `{ field, direction: "asc" | "desc", nullsFirst?, nullsLast? }` entries with field names of 1–100 characters.
- `markdownImport: true` opts into upload text extraction through `system_create`; it grants no write permission.
- `retiredFields` and `translatedFields` name frontmatter keys the type no longer owns: retired keys are read past and removed on start, translated keys are still read and moved to their new field.
- `containedIn` names the type whose records contain this one, as a book contains its sections.
- `actionPolicy` is the type's minimum action policy. It tightens a brain's wildcard defaults; a brain's explicit rule for the type still overrides it.
- `publish.publishStatuses` lists the statuses that require the `publish` action when entered or changed. It does not change which records count as published for published-only reads.

`classification` stays top-level and is refused inside `config`.

Metadata a definition writes — a seed, a `stub`, a decoded document, a create resolution or allocation, a generation result — is the schema's input, also accepted read-only. Written inline in `defineEntity`, it keeps its literal types without an annotation, including from a callback that takes no parameters, so an enum value needs no cast; one the schema does not accept is still refused.

The other basic slots on `defineEntity`:

- `metadataFrom(stored)` migrates stored metadata into the current schema before every parse, so records written in an older shape still read and validate. It must return current metadata unchanged.
- `singleton: true` limits the type to one record whose id is the entity type, and marks it as a single file for Studio. `hasBody: false` declares that the type has no free-form body below its frontmatter.
- `displayTitle({ content, metadata })` labels a record wherever the runtime shows it. It receives migrated, validated metadata, never writes the record, and a record whose metadata does not validate gets no label, so callers fall back to its title or id.
- `validatePersist({ content, visibility })` is a persistence invariant checked before every create and update of the type, including entity-only installs. It receives a frozen view; throwing rejects the write.
- `actions` is the type's own rule in the brain's action policy, for example `{ create: "never" }` for a record only the brain writes. It overrides the brain's wildcard defaults action by action, and the brain's own rules for the type override it in turn.
- `coverImage: true` declares that the type carries a cover image in `coverImageId`; `system_update` refuses a cover on a type that does not declare one.

`EntitySeedDefinition` is the optional `seed` slot: a default record the brain holds before anyone authors one. `EntitySeedTrigger` names when it is planted; `startup-content-settled` fires once startup content is in place, after a successful initial sync or at boot when none was pending, and never after a failed sync. Seeding is create-if-absent: `content()` is built only when no record with the seed's id exists at any visibility, so a seed never overwrites authored content.

Presentation on `defineEntity` and `defineEntityPackage`:

- `defineEntityPackage({ id, entities, dataSources })` declares the data its templates read. Data sources belong to the package: their ids are scoped to it, so two in one package cannot share an id, and every definition they read already exists when the package is assembled. A source cannot be declared inside the entity it reads, which would read the definition before it exists.
- `defineDataSource` has two forms, told apart by `fetch` or `entity`; declaring both or neither is refused.
  - **Fetching** (`DataSourceDefinition`): `fetch(query, entities, context)` reads through a `DataSourceEntityReader` — `get(definition, id)`, `list(definition, { limit?, offset?, sort? })` and `count(definition)`, each typed by the definition it names — and returns plain data.
  - **Entity** (`EntityDataSourceDefinition`): `entity` names a definition in the same package, and the runtime derives its full schema from it, as `EntityOf` does; authors never declare the runtime-owned base fields. `defaultSort` (`{ field, direction, nullsFirst?, nullsLast? }`), `defaultLimit` (default 100), `lookupField` (`"slug"` by default, or `"id"`), `enableNavigation` and `navigationLimit` (default 1000) configure the reads. `transform(entity)` receives the definition-typed entity; `list(items, pagination, query)` returns a JSON object, with `pagination` set when the query names a `page`; `filter(query)` may narrow the list to an exact match on the type's own metadata, applied before paging; `detail({ item, navigation, siblings, entities })` answers a query naming an `id`, and a source without one refuses such a query.
  - Reads see public records, and only published ones in a production build; a fetching source reads `context.publishedOnly` to know which. The runtime validates what either form returns against the caller's schema.
- `templates` registers templates keyed by local name under the type's scope. A template whose `dataSourceId` names one of its package's data sources follows it to the scoped id; any other id is kept as written.
- `feed` (`EntityFeedDeclaration`) syndicates the type: `path` (relative to the build output, no parent steps), `routePrefix` for the channel link, and `toItem(entity)`, which returns a `FeedItem` (`title`, `slug`, `description`, `content`, `author`, ISO `publishedAt`, optional `category`) or `null` to leave a record out. Every site build writes the feed into its staged output: a preview carries every record, a production build only those the type counts as published. A malformed item fails the build, which keeps the previous generation.

Creating and deriving on `defineEntity`:

- `create` (`EntityCreateRouting`) decides how `system_create` treats the type, keyed by how the caller expressed the request: `fromUpload` (an upload reference), `fromAttachment` (another entity's attachment), `fromContent` (content, including a conversation message) and `fromPrompt` (a description). Unrouted shapes go on to ordinary creation.
- A route (`EntityCreateRoute`) is `{ reject }` or `{ check?, resolve }`. `check(context)` answers before the user confirms, with an `EntityCreateCheck`: `ready` (optionally with the title and fields it derived), a `question` to ask first, or an `error`; a rejecting route answers `error` with its message. `resolve(context)` returns an `EntityCreateResolution` — `create`, `existing`, `update` or `refuse` — and the runtime performs it and reports what it did.
- The runtime validates created and updated metadata against the type's schema, writes with the caller's visibility and attribution, refuses to create an id that already exists at any visibility, and requires an `existing` or `update` id to exist at the caller's visibility. An `EntityCreateAttachment` builds the result's link from the id actually written.
- `EntityCreateContext` is frozen: a copy of the request, definition-typed reads at the caller's visibility, and an `EntityCreateUploadReader` over the runtime's shared upload store, the one a request's upload reference points into. `fromUpload.mediaTypes` also claims those uploads from the upload endpoint, through the same route.
- `attachments` declares source-derived artifacts as `EntityAttachmentDeclaration`s: an attachment `type` and a `provider(context)` factory returning an `AttachmentProvider`. The runtime builds each provider once the type is registered, with a frozen `MediaAttachmentContext` — `domain`, `themeCSS`, `identity.getProfile()`, `entityService.getEntity`/`listEntities` and `views.get`, all read-only — registers it, and releases it on shutdown.

Jobs and generation on `defineEntity`:

- `jobs` declares durable jobs keyed by local name; the runtime registers each under the type's scope. `defineEntityJob({ input, handle })` declares a job that does its own work (`EntityJobDeclaration`); `defineEntityJob({ input, generate })` declares one that generates an entity of the type (`EntityGenerationDeclaration`). The runtime parses job data with `input` before the callback runs.
- `EntityJobContext` is frozen: the parsed `input`, definition-typed `entities` reads as the package, `messaging.publish`, `progress.report` and the cancellation `signal`. `EntityGenerationContext` adds the allocated `entityId` (when the job was given one) and `ai.generate(request, schema)`. An `EntityGenerationRequest` names a template the type declares by its local name; `voice: true` writes in the brain's voice, the style guide governing voice and form.
- A generation returns an `EntityGenerationResult`: content, metadata (the type's schema input), an optional `id` when nothing was allocated (default: the slugified title), `resultExtras` for the job result, and an optional `linkInto` — an `EntityGenerationLink` setting a target's `field` or extending a target's `list` (dropping `replaces`). The runtime checks the link target before saving, refusing a missing target or a cover on a type that declares none. It then fills the allocated entity (keeping edits made while it generated), or creates one, and writes the link; a refusal or an error marks the allocated entity failed.
- `generation` registers a generation as the type's `{type}:generation` job, which `system_generate` queues after writing the `stub` placeholder. Without a `stub`, `system_generate` refuses the type.
- A create route may also return an `EntityCreateAllocation`: `create` (a placeholder, deduplicated) or `existing` plus a `delegate` (`EntityCreateDelegation`: a job this type declares and its input), so the runtime writes or finds the entity, queues the job with its id and reports `generating`; or a bare `delegate` that queues any declared job. An allocation must delegate to a job that generates; the job and its input are checked before anything is written, and a placeholder is removed again if the job cannot be queued.

The agent, the schedule and evals on `defineEntity`:

- `instructions` is plain text telling the agent how and when to reach for the type.
- `agentContext` (`EntityAgentContextProvider`) grounds the agent's next turn: given the `request` and definition-typed `entities` reads scoped to the asker's permission, it returns context items (`id`, `source`, optional `title`, `content`). An item that fails validation is dropped rather than costing the turn.
- `scheduledGeneration` (`EntityScheduledGenerationDeclaration`) answers the content pipeline's schedule for the type, and requires `generation`. `from` names the source type, an optional metadata `status` and a `limit` (1–100). `mode: "each"` writes from the first source no entity of this type already names in its `sourceEntityType`/`sourceEntityId` metadata; `"batch"` writes from all of them (`sourceEntityIds`). The runtime queues the type's `{type}:generation` job, reports back to the pipeline when nothing qualifies, and reports each generation's success or failure.
- `evals` (`EntityEvalDeclaration`) registers eval handlers keyed by id. Each receives the eval input and a frozen `EntityEvalContext`: `ai.generate` (as a generation has it), `entities` reads as the package, and `EntityEvalFixtures` — `seed` an entity of any type, `settleEmbeddings` (60-second bound), and `reset`, which removes this type's records up to a visibility (public by default) plus everything seeded. Reset deletes, so evals use isolated evaluation data.

Deriving with projection rules on `defineEntity`:

- `projectionRules` declares rules that derive entities of the type from many sources, or from sources no single `defineProjection` names. `defineProjectionRule` (`ProjectionRuleDefinition`) takes an `id` and `version` (durable and brain-wide: a new version re-derives), entity `sources`, the `targetType`, an optional `sourceChangeBatchDelayMs`, an `inputSchema` over JSON (`ProjectionJsonObject`; `ProjectionJsonObjectSchema` validates a JSON field), `selectInput(trigger, context, signal)` and `derive(input, context, signal)`, which returns `ProjectionWriteIntent`s that upsert or delete entities of the target type.
- The runtime fingerprints the selected input and derives again only when it changes, so everything a derivation depends on, a voice included, belongs in its input.
- A rule declared on a type writes that type only; one that names another is refused when the package is instantiated. `selectInput` is given bound entity reads, `resolvePrompt`, `appInfo` and `identityInput`; `derive` is given `ai.generate` and `ai.generateObject` and a logger — never the services behind them.
- The function form, `projectionRules: ({ template }) => [...]`, hands a rule the registered name of each template the type declares; naming one it does not declare is refused.

Operator slots on `defineEntity`:

- `analyticsReports` adds reports to `system_analytics`, each declared with `defineEntityAnalyticsReport` (`EntityAnalyticsReportDeclaration`): a kebab-case `type` the agent names (durable and brain-wide), a `description`, a `params` object schema that types `report`, and an optional `minVisibility` floor. The tool validates params before `report(params, context)` runs; `EntityAnalyticsReportContext` gives definition-typed `entities` reads at the caller's `visibility`, published records only for a public caller. The runtime removes the reports when the package goes.

Publishing on `defineEntity`:

- `publish` (`EntityPublishDeclaration`) hands the brain's publish pipeline the `PublishProvider` that publishes the type, once every plugin is registered. When a record goes out, the pipeline calls `provider.publish(content, metadata, imageData, documentData)` with the record's body, its metadata, its cover image (`PublishImageData`) and attached documents (`PublishMediaData`, bytes as `Uint8Array`), and records the outcome on the record: its `status` becomes `published`, the time goes in `timestampField` (`publishedAt` by default) and the `PublishResult` id in `resultIdField` when one is named. Both fields are metadata fields of the type.
- `publishAssets` (`EntityPublishAssetDeclaration`) names images the pipeline renders before a record goes out, such as a social card: each renders from one of the type's `attachments` through the brain's image job and records the image's id in `field` — `ogImageId`, or `coverImageId` on a type that declares `coverImage`. `requiredWhen` limits it to records with a given `status` or `visibility`; a record whose field is already set keeps it. An asset that names an attachment the type does not declare, or a cover on a type without one, is refused when the entity is defined.

Publishing to AT Protocol on `defineEntity`:

- `atproto` (`EntityAtprotoProjection`) publishes the type's public records as AT Protocol records. Its `lexicon` (`AtprotoLexicon`) names the collection and must define a record key; `validate` asks the PDS to validate records too. The runtime registers the projection for the type and releases it on shutdown.
- `isPublishable(entity)` says whether a public record is ready, such as a post that is no longer a draft; without it every public record is. It sees validated records only: a record that does not validate fails to build and is reported, rather than withdrawn from the PDS.
- `buildRecord(input)` returns the record, which the runtime validates against the lexicon before writing. `EntityAtprotoRecordInput` is frozen: the validated `entity`, the brain's and anchor's DIDs (`EntityAtprotoPublishConfig`), the record's `pageUrl` when the site gives it one, `topics`, `dryRun` for a preview, definition-typed `entities` reads as the package at every visibility (so a projection can refuse to publish something that is not public), and `uploadBlob({ data, mimeType })`, which stores bytes on the PDS and returns an `AtprotoBlobRef` — in a preview, a placeholder of the same type and size.

## `@rizom/brain/services`

Definitions and schema vocabulary:

- `contentGenerationResultSchema`
- `defineAccountSettings`
- `defineStudioWorkspace`
- `defineDashboardWidget`
- `defineEntityCatalog`
- `defineJob`
- `defineServicePlugin`
- `defineTool`
- `defineWorkspaceAction`
- `z`

Types:

- `AccountSettingsDefinition`
- `AccountSettingsFieldDefinition`
- `AccountSettingsValue`
- `StudioWorkspaceDefinition`
- `StudioWorkspaceView`
- `StudioWorkspaceViewBlock`
- `DashboardDigest`
- `DashboardOperatorView`
- `DashboardOperatorViewBlock`
- `DashboardWidgetDefinition`
- `OperatorCaller`
- `OperatorCapabilityDefinition`
- `OperatorCardBlock`
- `OperatorColumnsBlock`
- `OperatorEntityCatalogDefinition`
- `OperatorEntityReader`
- `OperatorQueryReader`
- `OperatorRegionBlock`
- `OperatorView`
- `OperatorViewBlock`
- `OperatorViewStatus`
- `ServiceContentGeneration`
- `ServiceContentGenerationContext`
- `ServiceContentGenerationItem`
- `ServiceContentGenerationResult`
- `ServiceContentGenerationSkipReason`
- `ServiceContentGenerationTarget`
- `ServiceContentGenerationTargetInput`
- `ServiceEntityIdPath`
- `ServiceJobDefinition`
- `ServiceJobReference`
- `ServiceJobStatus`
- `ServicePackageDefinition`
- `ServiceTemplateGenerationDefinition`
- `WorkspaceActionConfirmation`
- `WorkspaceActionDefinition`
- `WorkspaceActionFormControl`
- `WorkspaceActionFormDefinition`
- `WorkspaceActionFormFieldDefinition`
- `WorkspaceActionFormFieldMap`
- `WorkspaceActionFormOption`
- `WorkspaceActionResultDefinition`
- `WorkspaceActionResultFieldDefinition`
- `WorkspaceActionResultFieldMap`
- `WorkspacePreparedConfirmation`

These operator schemas and executor bindings are the accepted public contract. The account-settings runtime provides encrypted auth-DB persistence, redacted Account forms, principal isolation, and runtime-owned account-daemon reconciliation. Dashboard widgets and Studio workspaces register through host-owned semantic renderers; callbacks receive the canonical caller, secret-redacted current-principal settings, visibility-scoped entities, typed jobs, and cancellation. Studio adds schema-validated query state, bounded host-rendered plain text, typed dynamic catalogs and launch intents, caller/input/revision/expiry/single-use prepared confirmations, schema-driven action forms, bounded ephemeral result presentation, bounded `card` and primary/aside `columns` composition, collection-owned query controls, source-declared compact table rows, and one explicit top-level primary action. Studio keeps unannotated tables in a bounded scrolling fallback and positions the single declared action in the desktop head or phone action bar without hoisting in-flow controls. Form fields must cover every non-pre-bound object input field, select controls have explicit options, secret inputs use password controls, and result declarations cover only scalar object outputs. Forms may opt into collapsed disclosure presentation, and a field label may declaratively follow every option of another select field. Sensitive results are held only in renderer-local state and are cleared on workspace refresh or navigation. Missing optional hosts leave declarations inert, and execution-only workers never bind or register operator callbacks. The packed operator fixture compiles Account settings, Dashboard, and Studio authoring together without browser UI code.

### Content generation (implementation in progress)

Generation-only templates declare `schema`, `generation: { prompt }`, and `format`;
they do not require a React layout. Construct each target with `content.target()` using
a local generation-template key, an entity definition, `idPath` segments, and that entity's
schema input metadata. Each target is independently inferred, so `content.generate({ targets })`
can accept heterogeneous entities without widening their metadata types. Format-only or
unknown template keys are rejected.

A target is the frozen, validated JSON that `content.target()` returns. Its entity
definition is not on it, and its metadata has already been transformed by that definition
once; `generate` re-validates targets on submission, so a target may be reused across
calls. Normal entity persistence validation still applies. The active caller is bound when
submitting, not when constructing a target.

Use `contentGenerationResultSchema` as a generating tool's output schema. Results contain
admission decisions, not prose or completion evidence. Counts and references are checked;
`plannedTargets` includes both planned and queued items. Dry runs return planned/skipped
items, zero queued targets, and no batch or job references. All-skipped submissions also
have no batch reference. Submission items report local template declaration keys.

Generation is asynchronous, and its result is an admission record. Each item's destination
carries the stored `entityId` alongside its `idPath`, so observe completion by reading that
entity through a typed entity reader; never rebuild an identifier from path segments. The
returned `batchId` is the shared root job ID of the admitted children, for use with the
runtime's existing job diagnostics.

Targets are independent and may partially succeed. Re-submitting the same request is safe:
targets whose output already exists are skipped, and a job that planned against an older
revision conflicts rather than overwriting. A job runs at most once, so a failed job wrote
nothing and re-submitting generates only what is missing. Caller identity, permission levels, queue internals, and
authorization callbacks are not author inputs.

The packed service fixture compiles mixed targets and negative type tests, submits both
entity types through the CLI, and reads the committed outputs through typed entity readers.
Preview and repeat-submission skips are also covered. It uses an explicit CLI service grant
and a mocked provider, with real runtime and persistence. This is feature-level evidence,
not a transport-wide audit or full process-crash proof. Publishing preparation remains
separate; this surface is not yet release-accepted. Release nomination must update the
fixture's peer floor to the first published version providing it.

## `@rizom/brain/interfaces`

Definitions and schema vocabulary:

- `defineAccountSettings`
- `defineDaemon`
- `defineInterface`
- `defineMessageInterface`
- `defineRoute`
- `protocol`
- `z`

Account settings types:

- `AccountSettingsDefinition`
- `AccountSettingsFieldDefinition`
- `AccountSettingsValue`

Permission contract:

- `UserPermissionLevel`
- `UserPermissionLevelSchema`

The runtime owns HTTP hosting, caller permission and Anchor resolution, daemon supervision, worker exclusion, channel/provider registration, recipient validation, conversations, normalized progress, and shutdown. Account-settings declarations require auth-service plus the deployment-owned `ACCOUNT_SETTINGS_ENCRYPTION_KEY`; secret values are encrypted at rest and never echoed by Account APIs.

## `@rizom/site`

Definitions and schema vocabulary:

- `defineSection`
- `defineSite`
- `sectionGroup`
- `siteDefinitionSchema`
- `z`

Site, layout, route, and section types:

- `ComponentType`
- `EntityDisplayEntry`
- `NavigationItem`
- `NavigationMetadata`
- `NavigationMetadataInput`
- `NavigationSlot`
- `NavigationSlots`
- `RouteDefinition`
- `RouteDefinitionInput`
- `RouteSectionDefinition`
- `RuntimeScript`
- `SectionDefinition`
- `SectionDefinitionInput`
- `SectionGroup`
- `SectionMeta`
- `SiteContent`
- `SiteDefinition`
- `SiteDefinitionOverrides`
- `SiteLayoutInfo`
- `SiteLayoutProps`
- `SiteMetadata`
- `SiteMetadataCTA`
- `SiteMetadataSection`
- `SiteSectionDefinition`
- `SiteSectionGroup`
- `UserPermissionLevel`

JSON and schema-backed content types:

- `IsJsonValue`
- `JsonObject`
- `JsonObjectOutputGuard`
- `JsonPrimitive`
- `JsonValue`
- `SiteContentArrayFieldDefinition`
- `SiteContentDefinition`
- `SiteContentEnumFieldDefinition`
- `SiteContentFieldDefinition`
- `SiteContentNumberFieldDefinition`
- `SiteContentObjectFieldDefinition`
- `SiteContentSectionDefinition`
- `SiteContentStringFieldDefinition`

## Exported but not stable

`@rizom/brain/plugins`, `@rizom/brain/templates`, and the advanced names classified in `export-ledger.json` remain consumer-backed alpha contracts. They are not part of the patch-stable authoring commitment unless listed above. Pin an exact version when using them.

Internal `@brains/*` packages, runtime classes, contexts, registries, queue types, package metadata, root `z`, `PLUGIN_API_VERSION`, tuple factories, positional tools, and the removed site entry points are not public authoring contracts.

## Compatibility rule

A `0.2.x` candidate must compile and run the frozen entity, service, account-settings-interface, operator-surface, generic-interface, message-interface, site, and brain-definition fixtures without source changes. Additive stable exports require an updated ledger and compatibility fixture; breaking these names or behaviors requires a later minor release.
