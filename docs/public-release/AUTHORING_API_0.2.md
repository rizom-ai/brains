# Public API `0.2`

> **Candidate contract; stable nomination is pending.** Breaking alpha cleanup
> is allowed before the stable freeze. The patch-compatibility promise and
> later-minor requirement for breaking changes begin only when stable `0.2.0`
> is published; historical alpha releases do not establish those guarantees.

This is the proposed patch-stable public API ledger for the `0.2.x` line,
covering external authoring and headless browser contracts. Only symbols listed
below are nominated for the stable contract. The machine-readable source is
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
- `ChatSourceContext`
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
- `chatSourceContextSchema`
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

Entity metadata schemas describe canonical stored values. Defaults and safe
coercions are supported; refinements must be pure, and defaults must satisfy
the canonical schema. Explicit rewriting pipelines, preprocessors, codecs,
overwrite checks (including trim/case conversion), and success wrappers are
rejected recursively at definition/registration. Normalize external input in
tool/job/request schemas or import decoders instead. `metadataFrom` migrations
must leave current metadata unchanged.

Definitions and schema vocabulary:

- `defineEntity`
- `defineEntityPackage`
- `defineProjection`
- `frontmatterInContent`
- `z`
- `canWriteVisibility`
- `permissionToVisibilityScope`
- `DurableBulkMutationChildRef`
- `durableBulkMutationChildRefSchema`
- `isEntityValidationError`
- `ListToolOutputSchema`
- `createListToolOutputSchema`

Types:

- `EncodedEntityMarkdown`
- `EntityDefinition`
- `EntityDefinitionConfig`
- `EntityMarkdownCodec`
- `EntityMarkdownDocument`
- `EntityOf`
- `EntityAccess`
- `EntityReader`
- `EntityWriteInput`
- `EntityPackageDefinition`
- `EntitySeedDefinition`
- `EntitySeedTrigger`
- `ProjectionDefinition`

The runtime owns base entity fields, persistence, markdown validation, search indexing, projection scheduling, and worker execution.

Advanced named consumer: Studio uses `encodeEntityIdPath`, `entityIdPathSchema`,
`EntityIdPath`, `EntityIdPathInput`, `QueryEntityHierarchyRequest`, and
`EntityHierarchyPage`. Setup/job entity readers expose bounded `queryEntityHierarchy`
reads, capped by their visibility scope. Operator creation accepts `idPath` and
atomically requires that destination to be absent; it never silently renames or overwrites it.

`defineEntity.displayTitle` is a read-only label projection (named consumer: Note).
It receives content and validated metadata without a writer. Its result is never
used for serialization or persisted metadata; display labels cannot replace stored
titles. Studio asks the adapter through `ServiceEntityShapes.displayTitle`, rather
than deriving titles itself.
Note preserves authored titles and limits first-body-line fallbacks to 80 Unicode characters.

`defineEntity.singleton: true` constrains the record ID to its entity type and marks the type as a singleton for file collections. `markdown.frontmatter` optionally describes authored file fields separately from indexed metadata; otherwise the metadata schema is used. Ask content consumes both: bounded welcome/topic fields remain in markdown while indexed metadata stays empty.

`EntityDefinitionConfig` is the optional `config` slot on `defineEntity`. It carries deliberate opt-outs — `embeddable`, `projectionSource`, `projectionSourceRole`, `weight` — for entity types that are system configuration rather than user content. Omitted fields keep the runtime defaults.

`frontmatterInContent` builds the markdown codec for a type whose files keep
their own frontmatter — one synced to disk and edited there, where the header
is part of the document a person opens. Such a record holds the same fields
twice, and metadata is the copy a change reaches, so encoding merges metadata
over what the file already carries: tracked fields take the metadata value,
and anything added by hand survives.

`EntitySeedDefinition` is the optional `seed` slot. It declares a default entity the brain should hold before anyone authors one, created only when `EntitySeedTrigger` fires and only if no entity with that id exists, so a seed can never overwrite authored content.

Style guide contract:

- `DEFAULT_STYLE_GUIDE`
- `fetchStyleGuide`
- `fetchVoiceGuidance`
- `formatStyleGuidance`
- `formatVisualGuidance`
- `formatVoiceGuidance`
- `parseStyleGuideContent`
- `styleGuideFromEntity`
- `styleGuideFrontmatterSchema`
- `styleGuideMessagingSchema`
- `styleGuideVisualSchema`
- `styleGuideVoiceSchema`

Style guide types:

- `FormattedStyleGuidance`
- `StyleGuide`
- `StyleGuideEntityReader`
- `StyleGuideFrontmatter`
- `StyleGuideMessaging`
- `StyleGuideVisual`
- `StyleGuideVoice`

The brain's house style is a singleton entity. Packages that generate prose or imagery read it through `fetchStyleGuide` and render it with the `format*` helpers rather than reaching for the entity directly.

## `@rizom/brain/services`

The MCP server defaults to **basic mode**, whose built-in chat and confirm tools use the protocol names `mcp_chat` and `mcp_confirm`. Basic-mode clients ask `mcp_chat` to search or retrieve content through the brain. A tool's direct exposure is a separate setting: ordinary tools default to debug-only unless explicitly opted into basic exposure; being read-only does not opt them in. Internal agent availability remains separate. Enabling debug mode requires Admin access, and individual tool permissions still apply.

Definitions and schema vocabulary:

- `contentGenerationResultSchema`
- `SdkError`
- `SdkErrorCode`
- `SdkErrorData`
- `sdkErrorCodeSchema`
- `sdkErrorSchema`
- `defineAccountSettings`
- `defineStudioWorkspace`
- `defineDashboardWidget`
- `defineEntityCatalog`
- `defineJob`
- `defineRoute`
- `defineServicePlugin`
- `defineSubscription`
- `defineTool`
- `defineWorkspaceAction`
- `z`
- `verbatim`
- `permissionToVisibilityScope`
- `UserPermissionLevelSchema`
- `defineDataSource`
- `ServiceRecentJob`
- `SerializedStatusStore`
- `SerializedStatusStoreOptions`
- `StaticSiteOutput`
- `ServiceTemplateDefinition`
- `ServiceTemplateReads`
- `ServiceSchema`
- `ServiceRenderSchema`
- `requireSameOriginJson`
- `requireSameOriginRequest`
- `EntityAction`
- `IInboxNamespace`
- `IPluginsNamespace`
- `InterfaceCaller`
- `OperatorEntityWrites`
- `OperatorUploadOutcome`
- `OperatorUploadRequest`
- `RuntimeReadiness`
- `ServiceChannelReader`
- `ServiceEntityShapes`
- `UserPermissionLevel`
- `ServiceBatchOperation`
- `ServiceBatchOptions`
- `ServiceBatchReference`
- `ServiceBatchStatus`
- `ServiceJobHooks`
- `ServiceJobSettledContext`
- `ServiceJobSettledHandler`
- `IRuntimeStateNamespace`
- `RuntimeHealthCheck`
- `OperationalHealthProvider`
- `ServiceLifecycle`
- `OperatorColumnsBlock`
- `OperatorPanelBlock`
- `BoundWorkspaceAction`
- `OperatorBindingContext`
- `jsonResponse`
- `jsonError`
- `IInboxFollowUpsNamespace`

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
- `ServiceToolDefinition`
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
- `IRuntimeStateStore`
- `RuntimeStateScopeOptions`
- `AnyInterfaceRouteDefinition`
- `AnySubscriptionDefinition`
- `RequestContract`
- `SubscriptionDefinition`
- `EntityAccess`
- `EntityReader`
- `EntityWriteInput`
- `ServiceToolContext`
- `ServiceJobHandlerContext`
- `PublicSkill`
- `IAttachmentsNamespace`
- `IPermissionsNamespace`
- `ServiceActiveJob`
- `ServiceJobs`
- `ServicePublisher`
- `ServicePublishingAccess`
- `ConsoleSurface`
- `DashboardDigestLine`
- `DashboardWidgetProviderContext`
- `EntityCount`
- `InteractionInfo`
- `RuntimeOperatorActionControl`
- `RuntimeOperatorLaunchIntent`
- `RuntimeOperatorLinkTarget`
- `SurfacePermissionLevel`
- `AppInfo`
- `AnyDataSourceDeclaration`

These operator schemas and executor bindings are the accepted public contract. The account-settings runtime provides encrypted auth-DB persistence, redacted Account forms, principal isolation, and runtime-owned account-daemon reconciliation. Dashboard widgets and Studio workspaces register through host-owned semantic renderers; callbacks receive the canonical caller, secret-redacted current-principal settings, visibility-scoped entities, typed jobs, and cancellation. Studio adds schema-validated query state, bounded host-rendered plain text, typed dynamic catalogs and launch intents, caller/input/revision/expiry/single-use prepared confirmations, schema-driven action forms, bounded ephemeral result presentation, bounded `card` and primary/aside `columns` composition, collection-owned query controls, source-declared compact table rows, and one explicit top-level primary action. Studio keeps unannotated tables in a bounded scrolling fallback and positions the single declared action in the desktop head or phone action bar without hoisting in-flow controls. Form fields must cover every non-pre-bound object input field, select controls have explicit options, secret inputs use password controls, and result declarations cover only scalar object outputs. Forms may opt into collapsed disclosure presentation, and a field label may declaratively follow every option of another select field. Sensitive results are held only in renderer-local state and are cleared on workspace refresh or navigation. Missing optional hosts leave declarations inert, and execution-only workers never bind or register operator callbacks. The packed operator fixture compiles Account settings, Dashboard, and Studio authoring together without browser UI code.

### Content generation (implementation in progress)

Generation-only templates declare `schema`, `generation: { prompt }`, and `format`;
they do not require a React layout. Construct each target with `content.target()` using
a local generation-template key, an entity definition, `idPath` segments, and that entity's
schema input metadata. Each target is independently inferred, so `content.generate({ targets })`
can accept heterogeneous entities without widening their metadata types. Format-only or
unknown template keys are rejected.

A target is the frozen, validated JSON that `content.target()` returns. Its entity
definition is not on it, and its canonical metadata has already been validated by that
definition once (including defaults and safe coercions, not rewriting transforms).
`generate` re-validates targets on submission, so a target may be reused across calls.
Every destination must be declared or validly stewarded by the submitting service;
installing an entity package or referencing its definition grants no write authority. Normal entity persistence validation still applies. The active caller is bound when
submitting, not when constructing a target.

Use `contentGenerationResultSchema` as a generating tool's output schema. Results contain
admission decisions, not prose or completion evidence. Counts and references are checked;
`plannedTargets` includes both planned and queued items. Dry runs return planned/skipped
items, zero queued targets, and no batch or job references. All-skipped submissions also
have no batch reference. Submission items report local template declaration keys.

Advanced named consumer: Site Content uses `content.targetFromRegisteredTemplate`
for qualified templates discovered from composed site routes. These targets retain
registered names; destination ownership and live caller authorization still apply.
Site Content delegates durable writes, revision checks, force handling, and cancellation
to the shared generation runtime rather than a separate fill-section job.

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
- `defineMessageInterfacePackage`
- `defineRoute`
- `defineSubscription`
- `protocol`
- `z`
- `ANCHOR_EXTENSION_URI`

Account settings types:

- `AccountSettingsDefinition`
- `AccountSettingsFieldDefinition`
- `AccountSettingsValue`

Permission contract:

- `AgentResponse`
- `buildCoalescedInput`
- `buildConfirmationResponseParts`
- `buildMessageActorMetadata`
- `buildMessageSourceMetadata`
- `canReceiveNativeArtifactFile`
- `ConversationMessageActor`
- `extractCaptureableUrls`
- `formatArtifactDisplay`
- `formatConfirmationResult`
- `formatPendingConfirmationHelp`
- `formatPendingConfirmationsFallback`
- `formatStructuredOutputSummary`
- `formatToolStatusLabel`
- `getConfirmationResultTitle`
- `getToolStatusKey`
- `InboundMessageSender`
- `matchSpaceSelector`
- `MessageChannel`
- `MessageOutput`
- `MessageUploadContinuity`
- `PendingConfirmation`
- `PermissionLookupContext`
- `PresentedConfirmation`
- `PresentedMessage`
- `ReceiveAuthenticatedInput`
- `resolveArtifactEntityRefFromCard`
- `UserPermissionLevel`
- `UserPermissionLevelSchema`

Subscription and entity contracts:

- `AnySubscriptionDefinition`
- `RequestContract`
- `SubscriptionDefinition`
- `EntityAccess`
- `EntityReader`
- `EntityWriteInput`
- `PublicSkill`
- `ResolvedProfileKind`
- `ToolInfo`

The runtime owns HTTP hosting, caller permission and Anchor resolution, daemon supervision, worker exclusion, channel/provider registration, recipient validation, conversations, normalized progress, and shutdown. Account-settings declarations require auth-service plus the deployment-owned `ACCOUNT_SETTINGS_ENCRYPTION_KEY`; secret values are encrypted at rest and never echoed by Account APIs.

`InterfaceDaemonDefinition` is an advanced named type for declarations retained in setup state; Web Chat's guest maintenance is its supported consumer. A daemon must drain its work before its `run` promise settles on cancellation.

`SitePageResponse` is an advanced host-themed HTML response marker, supported by
Web Chat's preview page. It adds no routing or authorization authority.

Routes may declare `preview: true` for preview-host reachability; this never bypasses
session, origin, authorization, or admission checks. Interface setup exposes the
runtime-derived `siteUrl` and `previewUrl` for Web Chat's operator-authorized preview
trial. Omitted guest configuration remains inactive until authorized; explicit
`guest: false` disallows activation. These deployment origins never come from headers.

Message receive/approval inputs accept a request `signal`, combined with lifecycle
cancellation. An approval outcome of `failed` must not trigger an implicit replay;
`needsTerminal` tells the transport whether to close an unmatched client tool call.
Web Chat completes each submitted decision once and ends failed/aborted streams
without a success frame or provider-error disclosure.

Route handlers receive optional, detached, frozen `transport` socket metadata from the HTTP host. `transport.remoteAddress` is never inferred from Host, Origin, or forwarding headers; absence must fail closed wherever a peer restriction is required. The instance's `http.hostname` selects the listener's bind address.

Runtime-state `compareAndSet(key, expected, input)` compares a parsed read snapshot and persists validated JSON wire input, like `set`. A mismatch returns `false`; an invalid replacement rejects. The SQL update checks the exact stored snapshot atomically, including across connections. Use a persisted revision to distinguish ABA changes; non-deterministic read transformations cannot provide a stable expected snapshot.

## `@rizom/brain/testing`

Testing a package without booting a brain. The same harness every package in
this repository uses, narrowed to what an author needs and typed without
reaching into the runtime — the mock shell, the entity registry and the plugin
contexts stay internal.

- `createBrainTestHarness`
- `BrainTestHarness`
- `BrainTestHarnessOptions`
- `InstalledPackage`
- `InstalledTool`
- `SeededEntity`
- `TestCaller`
- `TestToolConfirmation`
- `ToolCallResult`
- `createTempDataDir`
- `createTempDataDirSync`

`InstalledPackage.tool(name)` and `job(name)` resolve exact local declaration
names. Tools and jobs expose `localName`; their `name` remains runtime-scoped.
`templateNames()` and `formatTemplate(name, value)` use exact declaration-local
names, including templates with explicit namespaces. Unknown or ambiguous
lookups throw with available names. Formatting parses the input once; registered
text formatters consume schema output, including transformed values.

`addEntities` and package writes feed deterministic fixture search: all query
terms must match id/title/body case-insensitively. Visibility, type filters,
generation-status filtering, sorting, weights, score cutoffs, and pagination
apply. Matches have base score 1 with type/id tie-breaking; the default page is
20 results and empty queries return none. This is not FTS or vector-search
acceptance. Reset removes the fixtures.

`fetchResponse(method, path, init)` returns the full, unconsumed `Response`,
including status and headers, after route authentication and schema validation.
`fetch` runs the same pipeline but decodes JSON responses to data; use
`fetchResponse` for protocol assertions, including explicit JSON responses.
Both helpers JSON-encode `init.body`, defaulting its content type only if no
case-insensitive header override is present. Relative paths resolve against
HTTPS at `options.domain` (hostname and optional port), or `https://test.brain`
when omitted; absolute URLs retain their own origin and scheme.
`init.transport?: { readonly remoteAddress?: string }` supplies explicit
test-only host socket metadata through the route pipeline's detached, frozen
snapshot. Omitting transport supplies no trusted peer, regardless of forwarding
headers.

Tool calls enforce declared permissions and return success, error, or
`{ ok: false, confirmation }` when approval is pending. Confirmation includes the
summary and replay arguments; it is not a failure. Package installation rolls
back all newly installed children on failure, without resetting earlier packages.

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

## `@rizom/brain-ui`

React components for site and dashboard templates. `react` and `react-dom` are peer dependencies. The package ships compiled JavaScript and bundled declarations; consumers need neither private workspace packages nor a StyleX compiler. The package holds more components than it publishes; this list is the supported surface, and adding to it requires a named consumer.

Standalone hosts of the `Widget*` components and `CardHeader` must include `operatorViewStylexCSS` in their stylesheet. This immutable CSS string is an advanced-with-consumer export, used by the Agent Discovery proximity-map template. Treat its contents and generated class names as opaque implementation details; Studio and Dashboard already supply the shared operator stylesheet.

Components and helpers:

- `Alert`
- `BackLink`
- `Breadcrumb`
- `CTASection`
- `Card`
- `CardHeader`
- `CardImage`
- `CardMetadata`
- `CardTitle`
- `ContentArchive`
- `ContentList`
- `CoverImage`
- `DetailPageHeader`
- `EmptyState`
- `Footer`
- `Head`
- `HeadProvider`
- `Header`
- `ImageRendererProvider`
- `KeyValueList`
- `LinkButton`
- `ListPageHeader`
- `MarkdownContent`
- `NewsletterSignup`
- `OgCard`
- `Pagination`
- `PresentationLayout`
- `SectionHeader`
- `StatBadge`
- `StatusBadge`
- `SubjectsList`
- `TagsList`
- `ThemeToggle`
- `WidgetActionLink`
- `WidgetActions`
- `WidgetEmptyState`
- `WidgetFilter`
- `WidgetList`
- `WidgetListItem`
- `WidgetMetaLine`
- `WidgetPrimitiveEmptyState`
- `WidgetStatusPill`
- `WidgetTabs`
- `WidgetTags`
- `createWidgetInstanceId`
- `cssVariables`
- `formatDate`
- `markdownToHtml`
- `renderHighlightedText`
- `splitWordmark`
- `tagVariants`
- `useMarkdownToHtml`

Types:

- `AlertProps`
- `BackLinkProps`
- `BreadcrumbItem`
- `BreadcrumbProps`
- `CSSVariableProperties`
- `CTASectionProps`
- `CardImageProps`
- `CardMetadataProps`
- `CardProps`
- `CardTitleProps`
- `ContentArchiveProps`
- `ContentItem`
- `ContentListProps`
- `CoverImageProps`
- `DetailPageHeaderProps`
- `EmptyStateProps`
- `HeadCollectorInterface`
- `HeadProps`
- `HeadProviderProps`
- `HeaderProps`
- `ImageRenderer`
- `ImageRendererProviderProps`
- `KeyValueItem`
- `LinkButtonProps`
- `ListPageHeaderProps`
- `MarkdownContentProps`
- `NewsletterSignupProps`
- `OgCardProps`
- `PaginationProps`
- `PresentationLayoutProps`
- `RenderedImageRef`
- `SectionHeaderProps`
- `StatBadgeProps`
- `StatusBadgeProps`
- `SubjectsListProps`
- `TagsListProps`
- `ThemeToggleProps`
- `WidgetDataAttributes`
- `WidgetElementProps`
- `WidgetFilterOption`
- `WidgetTabDefinition`

## Exported but not stable

`@rizom/brain/plugins`, `@rizom/brain/templates`, and the advanced names classified in `export-ledger.json` remain consumer-backed alpha contracts. They are not part of the patch-stable authoring commitment unless listed above. Pin an exact version when using them.

Internal `@brains/*` packages, runtime classes, contexts, registries, queue types, package metadata, root `z`, `PLUGIN_API_VERSION`, tuple factories, positional tools, and the removed site entry points are not public authoring contracts.

## Compatibility rule

After stable `0.2.0` is published, a `0.2.x` patch candidate must compile and run the frozen entity, service, account-settings-interface, operator-surface, generic-interface, message-interface, site, brain-definition, and reminders fixtures without source changes. Additive stable exports require an updated ledger and compatibility fixture; breaking these names or behaviors requires a later minor release. Before that freeze, breaking alpha cleanup must update the examples and evidence rather than preserve obsolete authoring paths.
