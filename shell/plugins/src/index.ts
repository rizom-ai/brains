// Plugin base class and core context
export { BasePlugin, type CoreContext } from "./base-plugin";

// Core plugin
export { CorePlugin } from "./core/core-plugin";
export type { CorePluginContext } from "./core/context";
export { createCorePluginContext } from "./core/context";

// Service plugin
export { ServicePlugin } from "./service/service-plugin";
export type { ServicePluginContext } from "./service/context";
export { createServicePluginContext } from "./service/context";

// Interface plugin
export { InterfacePlugin } from "./interface/interface-plugin";
export type { InterfacePluginContext } from "./interface/context";
export { createInterfacePluginContext } from "./interface/context";

// Message Interface plugin
export { MessageInterfacePlugin } from "./message-interface/message-interface-plugin";
export type { MessageInterfacePluginContext } from "./message-interface/context";
export {
  setupProgressHandler,
  extractJobContext,
} from "./message-interface/progress-handler";

// Plugin types and interfaces
export type {
  IShell,
  IMCPTransport,
  QueryContext,
  SystemCommandRegisterEvent,
  SystemToolRegisterEvent,
  SystemResourceRegisterEvent,
  DefaultQueryResponse,
  SimpleTextResponse,
  CreateEntityResponse,
  UpdateEntityResponse,
  PluginType,
  ToolVisibility,
  ToolContext,
  AppInfo,
  ToolResponse,
  PluginTool,
  PluginResource,
  PluginCapabilities,
  Plugin,
  ContentGenerationConfig,
  GenerateContentFunction,
  BaseJobTrackingInfo,
} from "./interfaces";

export {
  systemCommandRegisterSchema,
  systemToolRegisterSchema,
  systemResourceRegisterSchema,
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
  pluginMetadataSchema,
  ToolContextRoutingSchema,
  toolResponseSchema,
  appInfoSchema,
} from "./interfaces";

// Config utilities
export {
  basePluginConfigSchema,
  type PluginConfigInput,
  type PluginConfig,
} from "./config";

// Errors
export { PluginError } from "./errors";

// Plugin Manager
export {
  PluginManager,
  PluginRegistrationHandler,
  PluginStatus,
  PluginEvent,
  type IPluginManager,
  type PluginInfo,
  type PluginManagerEventMap,
  type PluginToolRegisterEvent,
  type PluginResourceRegisterEvent,
} from "./manager";

// ============================================================================
// Consolidated exports for plugin development
// ============================================================================

// From @brains/entity-service
export type {
  BaseEntity,
  EntityAdapter,
  EntityInput,
  SearchResult,
  SearchOptions,
  IEntityService,
  ICoreEntityService,
  IEntityRegistry,
} from "@brains/entity-service";
export {
  baseEntitySchema,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/entity-service";

// From @brains/conversation-service
export type {
  Conversation,
  Message,
  ConversationDigestPayload,
} from "@brains/conversation-service";
export { conversationDigestPayloadSchema } from "@brains/conversation-service";

// From @brains/content-service
export type {
  IContentService,
  GenerationContext,
} from "@brains/content-service";

// From @brains/templates (unified template type)
export type { Template, ComponentType } from "@brains/templates";
export { TemplateSchema, createTemplate } from "@brains/templates";

// From @brains/messaging-service
export type {
  MessageContext,
  MessageHandler,
  MessageSender,
  IMessageBus,
  MessageResponse,
  BaseMessage,
  MessageWithPayload,
} from "@brains/messaging-service";

// From @brains/job-queue
export type {
  JobHandler,
  BatchOperation,
  BatchJobStatus,
  Batch,
  JobProgressEvent,
  IJobQueueService,
} from "@brains/job-queue";
export { JobProgressEventSchema } from "@brains/job-queue";

// From @brains/command-registry
export type {
  Command,
  CommandInfo,
  CommandResponse,
  CommandContext,
} from "@brains/command-registry";
// Note: CommandRegistry is not exported as plugins access commands through context

// From @brains/render-service
export type { ViewTemplate, OutputFormat } from "@brains/render-service";
// Note: ViewRegistry is not exported as plugins access views through context
// Note: Route types moved to @brains/site-builder-plugin - plugins that need routes should import from there

// Note: DaemonRegistry is not exported as plugins should use IShell.registerDaemon()

// From @brains/db
export type { JobOptions, JobInfo, JobContext } from "@brains/job-queue";
export { JobContextSchema } from "@brains/job-queue";

// From @brains/utils
export type {
  ProgressNotification,
  ProgressCallback,
  ContentFormatter,
} from "@brains/utils";

// From @brains/permission-service
export type { UserPermissionLevel } from "@brains/permission-service";
export {
  Logger,
  LogLevel,
  createSilentLogger,
  ProgressReporter,
  ResponseFormatter,
  markdownToHtml,
  StructuredContentFormatter,
} from "@brains/utils";

// From @brains/identity-service
export type { IdentityBody } from "@brains/identity-service";
export { identityBodySchema } from "@brains/identity-service";

// From @brains/profile-service
export type { ProfileBody } from "@brains/profile-service";

// Utility functions
export { createId } from "./utils/id";
