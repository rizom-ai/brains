// ============================================================================
// Plugin Framework Core
// ============================================================================

// Base plugin classes
export { ServicePlugin } from "./service/service-plugin";
export {
  EntityPlugin,
  emptyEntityPluginConfigSchema,
} from "./entity/entity-plugin";
export { computeProjectionInputFingerprint } from "./entity/projection-input-fingerprint";
export {
  reconcileEntities,
  type ReconcileEntitiesOptions,
  type ReconcileEntitiesResult,
} from "./entity/entity-reconciler";
export {
  ProjectionJsonObjectSchema,
  ProjectionJsonValueSchema,
  ProjectionWriteIntentSchema,
  defineProjectionRule,
  type ProjectionEntityReader,
  type ProjectionEntityWrite,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionJsonObject,
  type ProjectionJsonValue,
  type ProjectionRule,
  type ProjectionRuleDefinition,
  type ProjectionRuleEntitySource,
  type ProjectionWaveInput,
  type ProjectionWaveTrigger,
  type ProjectionWriteIntent,
} from "./entity/projection-rule";
export {
  type ProjectionEntitySource,
  type ProjectionEntityType,
  type ProjectionGraph,
  type ProjectionGraphEdge,
  type ProjectionUnknownSourceTypes,
  type RegisteredProjection,
} from "./entity/projection-registry";
export type {
  EntityPluginContext,
  IEntitiesNamespace,
  IEntityAINamespace,
  IPromptsNamespace,
} from "./entity/context";
export { createAINamespace, createEntityPluginContext } from "./entity/context";
export {
  resolvePrompt,
  resetPromptCache,
  materializePrompts,
} from "./entity/prompt-resolver";
export {
  createPendingEntity,
  failPendingEntity,
  saveProcessedEntity,
  type CreatePendingEntityRequest,
  type CreatePendingEntityResult,
  type FailPendingEntityRequest,
  type FailPendingEntityResult,
  type PendingEntityMetadata,
  type PendingEntityService,
  type PendingIngestionStatus,
  type SaveProcessedEntityRequest,
  type SaveProcessedEntityResult,
} from "./entity/pending-ingestion";

export { InterfacePlugin } from "./interface/interface-plugin";
export {
  AccountSettingsRegistry,
  type AccountSettingsBackend,
  type AccountSettingsForm,
  type AccountSettingsFormField,
  type AccountSettingsRegistration,
  type AccountSettingsStorageIdentity,
  type AccountSettingsStoredValues,
  type ConfiguredAccountSettings,
  type RegisterAccountSettingsInput,
  type StoredAccountSettings,
} from "./operator/account-settings-registry";
export {
  ChannelRegistry,
  type ChannelDeliveryInput,
  type ChannelDeliveryProvider,
  type ChannelDeliveryResult,
  type ChannelDeliveryThreading,
  type ChannelDescriptor,
  type ChannelSubjectPattern,
  type IChannelRegistry,
} from "./channel-registry";
export {
  InboxFollowUpRegistry,
  resolvedInboxFollowUpSchema,
  type IInboxFollowUpRegistry,
  type InboxFollowUpContext,
  type InboxFollowUpJson,
  type InboxFollowUpKindRegistration,
  type InboxFollowUpMode,
  type InboxFollowUpResolutionInput,
  type InboxFollowUpTargetInput,
  type RegisteredInboxFollowUpKind,
  type ResolvedInboxFollowUp,
} from "./inbox-follow-up-registry";
export {
  InboxRegistry,
  inboxActionSchema,
  inboxActorSchema,
  inboxContactSchema,
  inboxEntityRefSchema,
  inboxFacetDefinitionSchema,
  inboxFacetDefinitionsSchema,
  inboxFacetKeySchema,
  inboxFacetOptionSchema,
  inboxFacetsSchema,
  inboxFacetValueSchema,
  inboxIdSchema,
  inboxItemDetailSchema,
  inboxItemIdSchema,
  inboxItemListSchema,
  inboxItemSchema,
  inboxSourceDescriptorSchema,
  inboxSourceMetadataSchema,
  inboxUrgencySchema,
  type IInboxRegistry,
  type InboxAction,
  type InboxActor,
  type InboxContact,
  type InboxEntityRef,
  type InboxFacetDefinition,
  type InboxFacetOption,
  type InboxFacets,
  type InboxFollowUpDeclaration,
  type InboxItem,
  type InboxItemDetail,
  type InboxSource,
  type InboxSourceDescriptor,
  type InboxSourceMetadata,
} from "./inbox-registry";

export { SYSTEM_CHANNELS, type SystemChannelName } from "./system-channels";
export { defineChannel, type Channel } from "./utils/channels";
export {
  createAdminListTool,
  createListToolOutputSchema,
  type ListToolOutput,
} from "./utils/admin-list-tool";

// Plugin contexts (needed for plugin initialization)
export type {
  ServicePluginContext,
  ServiceEntityService,
  IServiceTemplatesNamespace,
  IViewsNamespace,
} from "./service/context";
export {
  AttachmentRegistry,
  createAttachmentsNamespace,
  type AttachmentProvider,
  type AttachmentProviderMetadata,
  type AttachmentResolveRequest,
  type IAttachmentsNamespace,
} from "./service/attachment-registry";
export {
  RuntimeUploadRegistry,
  RuntimeUploadStore,
  RuntimeUploadStoreError,
  createRuntimeUploadsNamespace,
  normalizeRuntimeUploadDataDir,
  runtimeUploadIdPattern,
  defaultRuntimeUploadRetentionMs,
  defaultRuntimeUploadMaxCount,
  type IRuntimeUploadsNamespace,
  type ScopedRuntimeUploadStore,
  type ResolvedRuntimeUpload,
  type RuntimeUploadRecord,
  type RuntimeUploadRef,
  type RuntimeUploadResponseBody,
  type RuntimeUploadScopeOptions,
  type RuntimeUploadStoreErrorCode,
  type RuntimeUploadStoreOptions,
  type SaveRuntimeUploadInput,
} from "./service/upload-registry";
export type {
  BasePluginContext,
  IMessagingNamespace,
  IIdentityNamespace,
  IConversationsNamespace,
  IEvalNamespace,
  IInsightsNamespace,
  IProfileKindsNamespace,
  IChannelsNamespace,
  IInboxNamespace,
  IInboxFollowUpsNamespace,
  IOperationalHealthNamespace,
  IMessageInterfaceChannelsNamespace,
  ISemanticNamespace,
} from "./base/context";
export type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
export type {
  InterfacePluginContext,
  MessageInterfacePluginContext,
  IPermissionsNamespace,
  IDaemonsNamespace,
  IToolsNamespace,
  IApiRoutesNamespace,
  IWebRoutesNamespace,
  IPluginsNamespace,
  IInterfaceConversationsNamespace,
} from "./interface/context";

export { createServicePluginContext } from "./service/context";
export { createBasePluginContext } from "./base/context";
export {
  createInterfacePluginContext,
  createMessageInterfacePluginContext,
} from "./interface/context";

// ============================================================================
// Package definitions
// ============================================================================

export {
  assertIdentifier,
  bindPluginPackageMetadata,
  createPluginPackageDefinition,
  getPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  isPluginPackageDefinition,
  type AnyPluginConfigSchema,
  type CreatePluginPackageDefinitionInput,
  type InstalledPluginPackageMetadata,
  type PluginPackageConfig,
  type PluginPackageConfigInput,
  type PluginPackageDefinition,
  type PluginPackageFamily,
} from "./package-definition";
export {
  defineEntity,
  defineEntityPackage,
  defineProjection,
  type AnyEntityDefinition,
  type EncodedEntityMarkdown,
  type EntityDefinition,
  type EntityMarkdownCodec,
  type EntityMarkdownDocument,
  type EntityOf,
  type EntityPackageDefinition,
  type EntityVisibility,
  type EntityWriteInput,
  type ProjectionDefinition,
  type ProjectionTarget,
} from "./public/entity-definition";
export {
  defineAccountSettings,
  defineStudioWorkspace,
  defineDashboardWidget,
  defineEntityCatalog,
  defineJob,
  defineServicePlugin,
  defineTool,
  defineWorkspaceAction,
  type AccountSettingsDefinition,
  type AccountSettingsFieldDefinition,
  type AccountSettingsValue,
  type AnyServiceJobDefinition,
  type AnyServiceToolDefinition,
  type StudioWorkspaceDefinition,
  type StudioWorkspaceView,
  type StudioWorkspaceViewBlock,
  type DashboardDigest,
  type DashboardOperatorView,
  type DashboardOperatorViewBlock,
  type DashboardWidgetDefinition,
  type OperatorCaller,
  type OperatorCapabilityDefinition,
  type OperatorEntityCatalogDefinition,
  type OperatorEntityReader,
  type OperatorQueryReader,
  type OperatorView,
  type OperatorCardBlock,
  type OperatorColumnsBlock,
  type OperatorRegionBlock,
  type OperatorViewStatus,
  type OperatorViewBlock,
  type WorkspaceActionFormControl,
  type WorkspaceActionFormDefinition,
  type WorkspaceActionFormFieldDefinition,
  type WorkspaceActionFormFieldMap,
  type WorkspaceActionFormOption,
  type WorkspaceActionResultDefinition,
  type WorkspaceActionResultFieldDefinition,
  type WorkspaceActionResultFieldMap,
  type ServiceJobDefinition,
  type ServiceJobReference,
  type ServiceJobStatus,
  type ServicePackageDefinition,
  type WorkspaceActionConfirmation,
  type WorkspaceActionDefinition,
  type WorkspacePreparedConfirmation,
} from "./public/service-definition";
export {
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  defineRoute,
  protocol,
} from "./public/interface-definition";

// ============================================================================
// Essential Plugin Interfaces & Types
// ============================================================================

export type {
  Plugin,
  PluginRegistrationContext,
  PluginCapabilities,
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  ToolContext,
  ToolResponse,
  DirectMcpExposure,
  ToolConfirmation,
  ToolVisibility,
  RuntimeAppInfo,
  BackgroundWorkInfo,
  EndpointInfo,
  EndpointInfoInput,
  EntityCount,
  InteractionInfo,
  InteractionInfoInput,
  DefaultQueryResponse,
  BaseJobTrackingInfo,
  // Types needed by test harness and shell packages
  IShell,
  IInsightsRegistry,
  InsightHandler,
  QueryContext,
  JudgeInput,
  IMCPTransport,
  ToolInfo,
  EvalHandler,
  ContentGenerationConfig,
  GenerationStyleGuide,
  IEvalHandlerRegistry,
} from "./interfaces";

export {
  appInfoSchema,
  backgroundWorkInfoSchema,
  endpointInfoSchema,
  interactionInfoSchema,
  interactionKindSchema,
  interactionStatusSchema,
  defaultQueryResponseSchema,
  pluginMetadataSchema,
  toolResponseSchema,
} from "./interfaces";

// ============================================================================
// Entity System (Core Plugin Infrastructure)
// ============================================================================

// Core entity types
export type {
  BaseEntity,
  CreateCoverImageInput,
  CreateFromAttachmentInput,
  CreateFromInput,
  CreateFromUploadInput,
  CreateInput,
  CreateExecutionContext,
  CreateResult,
  CreateInterceptionResult,
  CreateInterceptor,
  UploadSaveInput,
  UploadSaveHandler,
  UploadSaveHandlerRegistration,
  ContentVisibility,
  EntityAdapter,
  EntityInput,
  EntitySchema,
  EntitySchemaParser,
  EntitySearchRequest,
  GetEntityRequest,
  ListEntitiesRequest,
  BaseEntityFrontmatterSchema,
  EntityMutationResult,
  EntityTypeConfig,
  ProjectionSourceRole,
  ICoreEntityService,
  IEntityService,
  EntityServiceClient,
  DurableBulkMutationCoordinator,
  ProjectSemanticSpaceRequest,
  SemanticEntityReference,
  SemanticSpaceDistanceRange,
  SemanticSpaceNeighbor,
  SemanticSpaceOrigin,
  SemanticSpacePoint,
  SemanticSpaceProjection,
  SearchResult,
} from "@brains/entity-service";
export {
  applyVisibilityToMarkdown,
  extractVisibilityFromMarkdown,
  BaseEntityAdapter,
  baseEntityParserSchema,
  baseEntitySchema,
  canWriteVisibility,
  contentVisibilitySchema,
  emptyFrontmatterSchema,
  internalFullScope,
  isVisibleWithinScope,
  permissionToVisibilityScope,
  scopedDerivedId,
  findEntityByIdentifier,
  resolveEntityOrError,
  generateMarkdownWithFrontmatter,
  getPublishBoundaryState,
  parseMarkdownWithFrontmatter,
  EntityValidationError,
  hasValidationIssues,
  isEntityValidationError,
  toEntityValidationError,
} from "@brains/entity-service";

// Data source infrastructure
export type {
  DataSource,
  DataSourceSchema,
  BaseDataSourceContext,
  PaginationInfo,
} from "@brains/entity-service";
export {
  BaseEntityDataSource,
  baseQuerySchema,
  baseInputSchema,
  type EntityDataSourceConfig,
  type BaseQuery,
  type NavigationResult,
  type SortField,
} from "./service/base-entity-datasource";
export { paginationInfoSchema } from "@brains/entity-service";

// ============================================================================
// Job System & Generation
// ============================================================================

export { BaseJobHandler, JobProgressEventSchema } from "@brains/job-queue";
export type { JobHandler } from "@brains/job-queue";
export {
  BaseGenerationJobHandler,
  type GenerationJobHandlerConfig,
  type GeneratedContent,
  type GenericCoverImageRequest,
} from "./service/base-generation-job-handler";

export type {
  Batch,
  BatchOperation,
  BatchJobStatus,
  JobContext,
  JobInfo,
  JobOptions,
  JobProgressEvent,
} from "@brains/job-queue";

// ============================================================================
// Templates & Content Generation
// ============================================================================

export type {
  Template,
  ComponentType,
  ViewTemplate,
  OutputFormat,
  UserPermissionLevel,
  PermissionLookupContext,
} from "@brains/templates";
export {
  createTemplate,
  OutputFormatSchema,
  PermissionService,
  UserPermissionLevelSchema,
  matchSpaceSelector,
} from "@brains/templates";

export type { ResolutionOptions } from "@brains/content-service";

// ============================================================================
// Communication & Messaging
// ============================================================================

export {
  AgentResponseSchema,
  ChatAttachmentSchema,
  ChatAttachmentSourceSchema,
  ChatContextSchema,
  PendingConfirmationSchema,
  TextChatAttachmentSchema,
  ActionsCardSchema,
  AttachmentCardDataSchema,
  AttachmentCardSchema,
  AttachmentCardSourceSchema,
  ChatActionSchema,
  EventChatActionSchema,
  PromptChatActionSchema,
  SourceCitationSchema,
  SourcesCardSchema,
  StructuredChatCardSchema,
  ToolApprovalCardSchema,
  ToolApprovalCardStateSchema,
  ToolResultDataSchema,
  type AgentResponse,
  type ChatAttachment,
  type ChatContext,
  type AgentNamespace,
  type ActionsCard,
  type AttachmentCard,
  type ChatAction,
  type EventChatAction,
  type PendingConfirmation,
  type PromptChatAction,
  type SourceCitation,
  type SourcesCard,
  type StructuredChatCard,
  type ToolApprovalCard,
  type ToolResultData,
} from "./contracts/agent";
export { AppInfoSchema, type AppInfo } from "./contracts/app-info";
export {
  OperationalHealthRegistry,
  type IOperationalHealthRegistry,
  type OperationalHealthProvider,
} from "./operational-health-registry";
export {
  RuntimeHealthCheckSchema,
  RuntimeQueueSignalsSchema,
  RuntimeReadinessSchema,
  RuntimeResourceSignalsSchema,
  type RuntimeHealthCheck,
  type RuntimeProjectionCircuitSignal,
  type RuntimeProjectionSignals,
  type RuntimeQueueSignals,
  type RuntimeReadiness,
  type RuntimeResourceSignals,
  type RuntimeWorkerSignals,
} from "./contracts/runtime-health";
export {
  ConversationSchema,
  MessageSchema,
  type Conversation,
  type Message,
} from "./contracts/conversations";
export {
  AnchorProfileSchema,
  BrainCharacterSchema,
  type AnchorProfile,
  type BrainCharacter,
} from "./contracts/identity";
export {
  BaseMessageSchema,
  MessageResponseSchema,
  type BaseMessage,
  type MessageContext,
  type MessageResponse,
  type MessageSendOptions,
  type MessageSendRequest,
  type MessageSender,
  type MessageWithPayload,
} from "./contracts/messaging";
export type {
  ConversationDigestPayload,
  GetMessagesOptions,
  IConversationService,
} from "@brains/conversation-service";
export {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_SOURCE_KIND,
  coerceConversationMetadata,
  conversationDigestPayloadSchema,
  conversationMessageActorSchema,
  conversationMessageMetadataSchema,
  conversationMessageSourceSchema,
} from "@brains/conversation-service";
export type { ConversationMessageActor } from "@brains/conversation-service";

export type { IAgentService } from "@brains/ai-service";

export type { IMessageBus } from "@brains/messaging-service";

export type { ContentFormatter } from "@brains/content-formatters";
export type { ProgressCallback } from "@brains/utils/progress";

// Message interface plugin (for CLI, Matrix, etc.)
export {
  MessageInterfacePlugin,
  MessageUploadContinuity,
  buildCoalescedInput,
  buildConfirmationResponseParts,
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
  canReceiveNativeArtifactFile,
  collectDeniedArtifactCardIds,
  type CoalescedInputMessage,
  type CoalescedInputMetadata,
  type CoalescedInputResult,
  type EditMessageRequest,
  type MessageInterfaceOutput,
  type MessageActorInput,
  type MessageArtifactAccessInput,
  type MessageArtifactAccessResult,
  type MessageArtifactEntity,
  type MessageJobTrackingInfo,
  type MessageProgressDisplay,
  type MessageSourceInput,
  type NativeArtifactDelivery,
  type NativeArtifactFile,
  type MessageUploadAttachmentRestorer,
  type MessageUploadContinuityOptions,
  type MessageUploadConversationLoader,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  PendingApprovalTracker,
  parseConfirmationIntent,
  parseConfirmationResponse,
  routeConfirmationResponse,
  artifactStatusLabel,
  buildApprovalResultView,
  formatApprovalRequestText,
  getPendingApprovalCards,
  getResolvedApprovalCard,
  collectPendingApprovalIdsFromStoredMessages,
  collectUploadIdsFromStoredMessages,
  defaultMessageUploadFilename,
  formatArtifactDisplay,
  formatMessageProgressDisplay,
  formatByteSize,
  getArtifactEntityFilename,
  getConfirmationResultTitle,
  parseArtifactDataUrl,
  resolveArtifactEntityRefFromCard,
  resolveArtifactEntityRefFromUrl,
  formatConfirmationResult,
  formatContentDispositionHeader,
  formatToolStatusLabel,
  formatPendingConfirmationHelp,
  formatPendingConfirmationsFallback,
  formatStructuredCardFallback,
  formatStructuredOutputSummary,
  buildResponsePlan,
  getArtifactCardState,
  getMessageUploadKind,
  type ResponsePlan,
  type ResponseRenderDirective,
  type AttachmentChatCard,
  type SupplementalChatCard,
  type ToolApprovalChatCard,
  getToolStatusDisplay,
  getToolStatusKey,
  getStoredAttachmentCards,
  getStoredMessageAttachments,
  getStoredMessageCards,
  isLikelyUtf8Text,
  narrowArtifactJobStatus,
  isMessageUploadDeclaredSizeAllowed,
  isMessageUploadSizeAllowed,
  isTextUploadSizeAllowed,
  isUploadableBinaryFile,
  isUploadableTextFile,
  messageBinaryUploadAccept,
  messageTextUploadAccept,
  messageTextUploadMaxBytes,
  messageUploadAccept,
  messageUploadMaxBytes,
  normalizeMessageUploadMediaType,
  normalizeTextUploadMediaType,
  parseStoredMessageMetadata,
  redactUploadRefs,
  redactUploadRefsInRecord,
  redactUploadRefsInStructuredCard,
  resolveMessageArtifactAccess,
  sanitizeUploadFilename,
  urlCaptureConfigSchema,
  validateMessageUpload,
  validateTextUpload,
  type ArtifactCardState,
  type ArtifactDisplay,
  type ArtifactEntityRef,
  type ArtifactEntityType,
  type ArtifactJobStatus,
  type ApprovalResolution,
  type ApprovalResultView,
  type ConfirmationDecision,
  type ConfirmationResultDisplay,
  type ConfirmationResultInput,
  type ConfirmationResultVariant,
  type ConfirmationRouteInput,
  type ConfirmationRouteResult,
  type ConfirmationResponseParts,
  type ConfirmationResponsePartsInput,
  type ContentDispositionInput,
  type ContentDispositionType,
  type InvalidUpload,
  type MessageUploadPolicyErrorCode,
  type MessageUploadValidationResult,
  type PendingApprovalMessageLoader,
  type PendingApprovalTrackerOptions,
  type ParsedArtifactDataUrl,
  type SelectPriorUploadsInput,
  type StoredMessageAttachment,
  type StructuredCardFallbackOptions,
  type TextUploadValidationResult,
  type ValidatedFileUpload,
  type ValidatedMessageUpload,
  type ValidatedTextUpload,
  type ValidateUploadInput,
  type ToolActivityEvent,
  type ToolActivityEventType,
  type ToolStatusDisplay,
  type ToolStatusState,
  type ToolStatusUpdate,
} from "./message-interface";

// ============================================================================
// Tools & Utilities
// ============================================================================

export {
  createTool,
  createResource,
  toolSuccess,
  toolError,
  toolResultSchema,
  type ToolResult,
  type ToolErrorResult,
} from "@brains/mcp-service";

export { ensureUniqueTitle } from "./service/create-entity-with-unique-title";

export { SerialQueue } from "./service/serial-queue";
export { SerializedStatusStore } from "./service/serialized-status-store";
export type { SerializedStatusStoreOptions } from "./service/serialized-status-store";

export { createId } from "@brains/utils/id";

// ============================================================================
// Routing & Navigation (Site Builder)
// ============================================================================

export type {
  RouteDefinition,
  RouteDefinitionInput,
  SectionDefinition,
  NavigationItem,
  NavigationSlot,
  EntityDisplayEntry,
} from "@brains/site-composition";
export type {
  WebRouteDefinition,
  RegisteredWebRoute,
  WebRouteMethod,
  WebRouteHandler,
  WebRouteMatch,
  JsonResponseInit,
} from "./types/web-routes";
export { jsonResponse, jsonError } from "./types/web-routes";
export {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  assertStudioWorkspaceAdmin,
  type StudioWorkspaceActor,
  type StudioWorkspaceAlias,
  type StudioWorkspaceDescriptor,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceRegistrationResult,
  type StudioWorkspaceRendererName,
  type StudioWorkspaceUnregistration,
} from "./types/studio-workspace";
export {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
  type DashboardWidgetRenderer,
  type StudioOverviewContributionRegistration,
  type StudioOverviewContributionUnregistration,
  type IDashboardNamespace,
} from "./base/dashboard-namespace";
export {
  createBuiltInStudioWorkspaceRegistration,
  registerBuiltInStudioWorkspace,
} from "./operator/studio-workspace-runtime";
export { registerBuiltInDashboardWidget } from "./operator/dashboard-widget-runtime";
export {
  safeParseRuntimeStudioOperatorView,
  safeParseRuntimeDashboardWidgetData,
  type RuntimeStudioOperatorBlock,
  type RuntimeStudioOperatorRegionBlock,
  type RuntimeStudioOperatorCardBlock,
  type RuntimeStudioOperatorColumnsBlock,
  type RuntimeStudioOperatorViewStatus,
  type RuntimeStudioOperatorDetailBlock,
  type RuntimeStudioOperatorPanelBlock,
  type RuntimeStudioOperatorView,
  type RuntimeStudioWorkspaceData,
  type RuntimeDashboardOperatorPanelBlock,
  type RuntimeDashboardOperatorView,
  type RuntimeDashboardWidgetData,
  type RuntimeOperatorActionControl,
  type RuntimeWorkspaceActionForm,
  type RuntimeWorkspaceActionFormField,
  type RuntimeWorkspaceActionResult,
  type RuntimeWorkspaceActionResultField,
  type RuntimeOperatorLaunchIntent,
  type RuntimeOperatorLinkTarget,
  type RuntimeOperatorScalar,
  type RuntimePreparedConfirmation,
} from "./operator/operator-view-runtime";
export {
  RouteDefinitionSchema,
  NavigationSlots,
  RegisterRoutesPayloadSchema,
  UnregisterRoutesPayloadSchema,
  ListRoutesPayloadSchema,
  GetRoutePayloadSchema,
} from "@brains/site-composition";

export type {
  ApiRouteDefinition,
  RegisteredApiRoute,
} from "./types/api-routes";
// ============================================================================
// Identity & Configuration
// ============================================================================

export {
  basePluginConfigSchema,
  isPluginConfigValidationError,
  PluginConfigValidationError,
  type PluginConfig,
  type PluginConfigInput,
  type PluginConfigSchema,
  type PluginConfigValidationIssue,
} from "./config";

export type {
  AnchorProfileKind,
  IAnchorProfileService,
  ProfileCategory,
  ProfileKindDefinition,
  ProfileKindLabels,
  ResolvedProfileKind,
  ResolvedProfileSelection,
} from "@brains/identity-service";
export {
  AnchorProfileService,
  anchorProfileBodySchema,
  anchorProfileKindSchema,
  brainCharacterBodySchema,
} from "@brains/identity-service";

// ============================================================================
// A2A Agent Card Schema
// ============================================================================
export {
  ANCHOR_EXTENSION_URI,
  agentCardSchema,
  agentCardSkillSchema,
  anchorExtensionParamsSchema,
  parseAgentCard,
  type AnchorExtensionProfile,
  type ParsedAgentCard,
} from "./a2a/agent-card-schema";
export { skillDataSchema, type SkillData } from "./a2a/skill-data-schema";
export type { IPublicSkillsNamespace, PublicSkill } from "./a2a/public-skills";

// ============================================================================
// System Integration (Daemons, Interface Plugins)
// ============================================================================

export type {
  Daemon,
  DaemonHealth,
  DaemonInfo,
  DaemonStatusInfo,
  IDaemonRegistry,
} from "./manager/daemon-types";

// ============================================================================
// Plugin Management (for shell core)
// ============================================================================

export { PluginManager } from "./manager";

// Error handling
export { PluginError } from "./errors";
export {
  deriveConsoleSurfaces,
  type ConsoleSurface,
  type SurfacePermissionLevel,
} from "./console-surfaces";
