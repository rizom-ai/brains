// ============================================================================
// Plugin Framework Core
// ============================================================================

// Base plugin classes
export { ServicePlugin } from "./service/service-plugin";
export { CorePlugin } from "./core/core-plugin";
export { InterfacePlugin } from "./interface/interface-plugin";

// Plugin contexts (needed for plugin initialization)
export type { ServicePluginContext } from "./service/context";
export type { CorePluginContext } from "./core/context";
export type { InterfacePluginContext } from "./interface/context";

export { createServicePluginContext } from "./service/context";
export { createCorePluginContext } from "./core/context";
export { createInterfacePluginContext } from "./interface/context";

// ============================================================================
// Essential Plugin Interfaces & Types
// ============================================================================

export type {
  Plugin,
  PluginCapabilities,
  PluginTool,
  PluginResource,
  ToolContext,
  ToolResponse,
  ToolConfirmation,
  ToolVisibility,
  AppInfo,
  DefaultQueryResponse,
  BaseJobTrackingInfo,
  // Types needed by test harness and shell packages
  IShell,
  QueryContext,
  IMCPTransport,
  ToolInfo,
  EvalHandler,
  ContentGenerationConfig,
  IEvalHandlerRegistry,
} from "./interfaces";

export {
  appInfoSchema,
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
  EntityAdapter,
  EntityInput,
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
export {
  BaseGenerationJobHandler,
  type GenerationJobHandlerConfig,
  type GeneratedContent,
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
} from "@brains/templates";
export { createTemplate, PermissionService } from "@brains/templates";

export type { ResolutionOptions } from "@brains/content-service";

// ============================================================================
// Communication & Messaging
// ============================================================================

export type {
  Conversation,
  Message,
  ConversationDigestPayload,
} from "@brains/conversation-service";
export { conversationDigestPayloadSchema } from "@brains/conversation-service";

export type {
  MessageResponse,
  MessageSender,
  MessageWithPayload,
  IMessageBus,
  MessageContext,
} from "@brains/messaging-service";

export type { ProgressCallback, ContentFormatter } from "@brains/utils";

// Message interface plugin (for CLI, Matrix, etc.)
export {
  MessageInterfacePlugin,
  parseConfirmationResponse,
  urlCaptureConfigSchema,
} from "./message-interface";

export type { AgentResponse, ChatContext } from "@brains/ai-service";

// ============================================================================
// Tools & Utilities
// ============================================================================

export {
  createTypedTool,
  toolSuccess,
  toolError,
  toolResultSchema,
  type ToolResult,
} from "./utils/tool-helpers";

export { ensureUniqueTitle } from "./service/create-entity-with-unique-title";
export { findEntityByIdentifier } from "./utils/find-entity";
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
  EntityRouteEntry,
} from "./types/routes";
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

export type {
  BrainCharacter,
  AnchorProfile,
  IAnchorProfileService,
} from "@brains/identity-service";
export {
  AnchorProfileService,
  anchorProfileBodySchema,
  brainCharacterBodySchema,
  baseProfileExtension,
  fetchAnchorProfile,
} from "@brains/identity-service";

// ============================================================================
// AI Services (for MCP interface)
// ============================================================================

export type { IAgentService } from "@brains/ai-service";

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
