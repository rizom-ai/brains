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

export { InterfacePlugin } from "./interface/interface-plugin";

export { SYSTEM_CHANNELS, type SystemChannelName } from "./system-channels";
export { defineChannel, type Channel } from "./utils/channels";

// Plugin contexts (needed for plugin initialization)
export type {
  ServicePluginContext,
  IServiceTemplatesNamespace,
  IViewsNamespace,
} from "./service/context";
export type {
  BasePluginContext,
  IMessagingNamespace,
  IIdentityNamespace,
  IConversationsNamespace,
  IEvalNamespace,
  IInsightsNamespace,
} from "./base/context";
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
  CreateInput,
  CreateExecutionContext,
  CreateResult,
  CreateInterceptionResult,
  CreateInterceptor,
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
  ChatContextSchema,
  PendingConfirmationSchema,
  ToolResultDataSchema,
  type AgentResponse,
  type ChatContext,
  type AgentNamespace,
  type PendingConfirmation,
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
} from "@brains/conversation-service";
export { conversationDigestPayloadSchema } from "@brains/conversation-service";

export type { IMessageBus } from "@brains/messaging-service";

export type { ContentFormatter } from "@brains/content-formatters";
export type { ProgressCallback } from "@brains/utils";

// Message interface plugin (for CLI, Matrix, etc.)
export {
  MessageInterfacePlugin,
  type EditMessageRequest,
  type MessageJobTrackingInfo,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  parseConfirmationResponse,
  formatConfirmationPrompt,
  urlCaptureConfigSchema,
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
} from "./types/routes";
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
} from "./types/routes";

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
