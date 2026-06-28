// ============================================================================
// Plugin Framework Core
// ============================================================================

// Base plugin classes
export { ServicePlugin } from "./service/service-plugin";
export { EntityPlugin } from "./entity/entity-plugin";
export {
  hasPersistedTargets,
  reconcileDerivedEntities,
  registerDerivedEntityProjection,
  type DerivedEntityProjection,
  type DerivedEntityProjectionController,
  type EntityChangePayload,
  type ReconcileDerivedEntitiesResult,
} from "./entity/derived-entity-projection";
export type {
  EntityPluginContext,
  IEntitiesNamespace,
  IEntityAINamespace,
  IPromptsNamespace,
} from "./entity/context";
export { createEntityPluginContext } from "./entity/context";
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

export { SYSTEM_CHANNELS, type SystemChannelName } from "./system-channels";
export { defineChannel, type Channel } from "./utils/channels";

// Plugin contexts (needed for plugin initialization)
export type {
  ServicePluginContext,
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
} from "./base/context";
export type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
  RuntimeStateRecordValue,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
export type {
  InterfacePluginContext,
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
export { createInterfacePluginContext } from "./interface/context";

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
  ToolConfirmation,
  ToolVisibility,
  RuntimeAppInfo,
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
  IEvalHandlerRegistry,
} from "./interfaces";

export {
  appInfoSchema,
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
  EntityMutationResult,
  EntityTypeConfig,
  ICoreEntityService,
  IEntityService,
  SearchResult,
} from "@brains/entity-service";
export {
  BaseEntityAdapter,
  baseEntitySchema,
  contentVisibilitySchema,
  internalFullScope,
  isVisibleWithinScope,
  permissionToVisibilityScope,
  scopedDerivedId,
  findEntityByIdentifier,
  resolveEntityOrError,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";

// Data source infrastructure
export type {
  DataSource,
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
export type { ProgressCallback } from "@brains/utils";

// Message interface plugin (for CLI, Matrix, etc.)
export {
  MessageInterfacePlugin,
  MessageUploadContinuity,
  buildAgentResponseTextParts,
  buildCoalescedInput,
  buildConfirmationResponseParts,
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
  canReceiveNativeArtifactFile,
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
  type MessageUploadAttachmentRestorer,
  type MessageUploadContinuityOptions,
  type MessageUploadConversationLoader,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  PendingApprovalTracker,
  parseConfirmationResponse,
  routeConfirmationResponse,
  artifactStatusLabel,
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
  formatConfirmationPrompt,
  formatConfirmationResult,
  formatContentDispositionHeader,
  formatToolStatusLabel,
  formatPendingConfirmationHelp,
  formatPendingConfirmationsFallback,
  formatStructuredCardFallback,
  formatStructuredOutputSummary,
  getArtifactCardState,
  getDeliverableArtifactCards,
  getMessageUploadKind,
  getResponseJobIds,
  getSupplementalCards,
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
  type AgentResponseTextPartsInput,
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
} from "@brains/mcp-service";

export { ensureUniqueTitle } from "./service/create-entity-with-unique-title";

export { createId } from "@brains/utils";

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
} from "./types/web-routes";
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
  type PluginConfig,
  type PluginConfigInput,
} from "./config";

export type { IAnchorProfileService } from "@brains/identity-service";
export {
  AnchorProfileService,
  anchorProfileBodySchema,
  brainCharacterBodySchema,
  baseProfileExtension,
  professionalProfileExtension,
  fetchAnchorProfile,
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
  type ParsedAgentCard,
  skillDataSchema,
  type SkillData,
} from "./a2a/agent-card-schema";

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
