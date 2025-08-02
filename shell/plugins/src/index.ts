// Plugin base class and core context
export { BasePlugin, type CoreContext } from "./base-plugin";

// Core plugin
export { CorePlugin } from "./core/core-plugin";
export type { CorePluginContext } from "./core/context";
export { createCorePluginContext } from "./core/context";
export { CorePluginTestHarness } from "./core/test/harness";

// Service plugin
export { ServicePlugin } from "./service/service-plugin";
export type { ServicePluginContext } from "./service/context";
export { createServicePluginContext } from "./service/context";
export { ServicePluginTestHarness } from "./service/test/harness";

// Interface plugin
export { InterfacePlugin } from "./interface/interface-plugin";
export type { InterfacePluginContext } from "./interface/context";
export { createInterfacePluginContext } from "./interface/context";
export { InterfacePluginTestHarness } from "./interface/test/harness";

// Message Interface plugin
export { MessageInterfacePlugin } from "./message-interface/message-interface-plugin";
export type { MessageInterfacePluginContext } from "./message-interface/context";
export { MessageInterfacePluginTestHarness } from "./message-interface/test/harness";
export {
  setupProgressHandler,
  extractJobContext,
} from "./message-interface/progress-handler";

// Plugin types and interfaces
export type {
  IShell,
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
export { baseEntitySchema } from "@brains/entity-service";

// From @brains/content-generator
export type {
  Template,
  TemplateDataContext,
  GenerationContext,
  ComponentType,
  IContentGenerator,
} from "@brains/content-generator";
export { TemplateSchema } from "@brains/content-generator";

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
} from "@brains/view-registry";
// Note: ViewRegistry is not exported as plugins access views through context

// Note: DaemonRegistry is not exported as plugins should use IShell.registerDaemon()

// From @brains/db
export type { JobOptions, JobQueue, JobContext } from "@brains/db";
export { JobContextSchema } from "@brains/db";

// From @brains/utils
export type {
  Logger,
  ProgressNotification,
  UserPermissionLevel,
} from "@brains/utils";
export { createSilentLogger } from "@brains/utils";

// Test utilities from @brains/core
export { MockShell } from "@brains/core/test";
