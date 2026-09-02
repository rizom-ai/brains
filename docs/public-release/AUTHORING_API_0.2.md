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

Headless browser Chat domain and transport:

- `BROWSER_CHAT_API_VERSION`
- `DEFAULT_BROWSER_CHAT_API_PATH`
- `BrowserChatApiError`
- `createBrowserChatApiPaths`
- `createBrowserChatClient`

Client and transport types:

- `BrowserChatApiErrorKind`
- `BrowserChatApiPaths`
- `BrowserChatClient`
- `BrowserChatClientOptions`
- `BrowserChatFetch`

Domain types:

- `ArchiveBrowserChatSessionResponse`
- `BrowserChatActionRequest`
- `BrowserChatActionResponse`
- `BrowserChatApprovalResponse`
- `BrowserChatApprovalResponsePart`
- `BrowserChatCard`
- `BrowserChatContextHandoffRequest`
- `BrowserChatContextHandoffResponse`
- `BrowserChatEventAction`
- `BrowserChatFilePart`
- `BrowserChatHistoryAttachment`
- `BrowserChatHistoryAttachmentSource`
- `BrowserChatHistoryMessage`
- `BrowserChatJobStatus`
- `BrowserChatJobStatusValue`
- `BrowserChatMessage`
- `BrowserChatMessageRequest`
- `BrowserChatMessageRole`
- `BrowserChatMessagesResponse`
- `BrowserChatProgressEvent`
- `BrowserChatSession`
- `BrowserChatSessionsResponse`
- `BrowserChatSourceContext`
- `BrowserChatTextPart`
- `BrowserChatToolStatusEvent`
- `BrowserChatToolStatusValue`
- `BrowserChatUploadPart`
- `BrowserChatUploadPartData`
- `BrowserChatUploadRef`
- `BrowserChatUploadResponse`
- `DeleteBrowserChatSessionResponse`
- `RenameBrowserChatSessionRequest`
- `RenameBrowserChatSessionResponse`

Schemas:

- `archiveBrowserChatSessionResponseSchema`
- `browserChatActionRequestSchema`
- `browserChatActionResponseSchema`
- `browserChatApprovalResponsePartSchema`
- `browserChatApprovalResponseSchema`
- `browserChatCardSchema`
- `browserChatContextHandoffRequestSchema`
- `browserChatContextHandoffResponseSchema`
- `browserChatEventActionSchema`
- `browserChatFilePartSchema`
- `browserChatHistoryAttachmentSchema`
- `browserChatHistoryAttachmentSourceSchema`
- `browserChatHistoryMessageSchema`
- `browserChatJobStatusSchema`
- `browserChatMessageRequestSchema`
- `browserChatMessageSchema`
- `browserChatMessagesResponseSchema`
- `browserChatProgressEventSchema`
- `browserChatSessionSchema`
- `browserChatSessionsResponseSchema`
- `browserChatSourceContextSchema`
- `browserChatTextPartSchema`
- `browserChatToolStatusEventSchema`
- `browserChatUploadPartSchema`
- `browserChatUploadRefSchema`
- `browserChatUploadResponseSchema`
- `deleteBrowserChatSessionResponseSchema`
- `renameBrowserChatSessionRequestSchema`
- `renameBrowserChatSessionResponseSchema`

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
- `z`

Types:

- `EncodedEntityMarkdown`
- `EntityDefinition`
- `EntityMarkdownCodec`
- `EntityMarkdownDocument`
- `EntityOf`
- `EntityPackageDefinition`
- `ProjectionDefinition`

The runtime owns base entity fields, persistence, markdown validation, search indexing, projection scheduling, and worker execution.

## `@rizom/brain/services`

Definitions and schema vocabulary:

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
- `ServiceJobDefinition`
- `ServiceJobReference`
- `ServiceJobStatus`
- `ServicePackageDefinition`
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
