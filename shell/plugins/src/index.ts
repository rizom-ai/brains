// Plugin base class and core context
export { BasePlugin, type CoreContext } from "./base-plugin";

// Unified test harness for all plugin types
export {
  PluginTestHarness,
  createCorePluginHarness,
  createServicePluginHarness,
  createInterfacePluginHarness,
  type HarnessOptions,
} from "./test/harness";

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
  DaemonHealth,
  Daemon,
  ToolVisibility,
  ToolContext,
  ToolResponse,
  PluginTool,
  PluginResource,
  PluginCapabilities,
  Plugin,
  ContentGenerationConfig,
  GenerateContentFunction,
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
  DaemonHealthSchema,
  ToolContextRoutingSchema,
  toolResponseSchema,
} from "./interfaces";

// Config utilities
export {
  basePluginConfigSchema,
  validatePluginConfig,
  mergePluginConfig,
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
  IEntityService,
  ICoreEntityService,
  EntityRegistry,
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

// From @brains/content-service
export type {
  IContentService,
  GenerationContext,
} from "@brains/content-service";

// From @brains/view-registry
export type {
  ComponentType,
} from "@brains/view-registry";

// From @brains/content-service (Template moved here)
export type { ContentTemplate } from "@brains/content-service";
export { ContentTemplateSchema } from "@brains/content-service";

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

// From @brains/view-registry
export type {
  RouteDefinition,
  ViewTemplate,
  SectionDefinition,
  OutputFormat,
} from "@brains/view-registry";
export { RouteDefinitionSchema } from "@brains/view-registry";
// Note: ViewRegistry is not exported as plugins access views through context

// Note: DaemonRegistry is not exported as plugins should use IShell.registerDaemon()

// From @brains/db
export type { JobOptions, JobQueue, JobContext } from "@brains/job-queue";
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

// Test utilities from @brains/core
export { MockShell } from "@brains/core";

// Content management exports removed - these types are now defined in site-builder plugin

// Utility functions
export { createId } from "./utils/id";
