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
- `EntityPackageDefinition`
- `EntitySeedDefinition`
- `EntitySeedTrigger`
- `ProjectionDefinition`

The runtime owns base entity fields, persistence, markdown validation, search indexing, projection scheduling, and worker execution.

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

Definitions and schema vocabulary:

- `contentGenerationResultSchema`
- `messageErrorCodeSchema`
- `MessageErrorCode`
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

The runtime owns HTTP hosting, caller permission and Anchor resolution, daemon supervision, worker exclusion, channel/provider registration, recipient validation, conversations, normalized progress, and shutdown. Account-settings declarations require auth-service plus the deployment-owned `ACCOUNT_SETTINGS_ENCRYPTION_KEY`; secret values are encrypted at rest and never echoed by Account APIs.

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
- `ToolCallResult`
- `createTempDataDir`
- `createTempDataDirSync`

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

React components for site and dashboard templates. `react` and `react-dom` are peer dependencies. The package holds more components than it publishes; this list is the supported surface, and adding to it requires a named consumer.

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
- `PublicSkill`
- `ResolvedProfileKind`
- `ToolInfo`
- `AnySubscriptionDefinition`

## Exported but not stable

`@rizom/brain/plugins`, `@rizom/brain/templates`, and the advanced names classified in `export-ledger.json` remain consumer-backed alpha contracts. They are not part of the patch-stable authoring commitment unless listed above. Pin an exact version when using them.

Internal `@brains/*` packages, runtime classes, contexts, registries, queue types, package metadata, root `z`, `PLUGIN_API_VERSION`, tuple factories, positional tools, and the removed site entry points are not public authoring contracts.

## Compatibility rule

A `0.2.x` candidate must compile and run the frozen entity, service, account-settings-interface, operator-surface, generic-interface, message-interface, site, and brain-definition fixtures without source changes. Additive stable exports require an updated ledger and compatibility fixture; breaking these names or behaviors requires a later minor release.
