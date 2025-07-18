import type { Logger } from "@brains/utils";
import type { ContentGenerationConfig, Daemon } from "@brains/plugin-utils";
import type { MessageSender, MessageHandler } from "@brains/messaging-service";
import type {
  BaseEntity,
  EntityAdapter,
  Template,
  DefaultQueryResponse,
} from "@brains/types";
import type { EntityService } from "@brains/entity-service";
import type { JobOptions, JobQueue } from "@brains/db";
import type {
  JobHandler,
  BatchOperation,
  BatchJobStatus,
  Batch,
} from "@brains/job-queue";
import type { RouteDefinition, ViewTemplate } from "@brains/view-registry";
import type { z } from "zod";

// Command interface - core concept for all plugins
export interface Command {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[]) => Promise<string> | string;
}

// Command metadata for discovery (no handler)
export interface CommandInfo {
  name: string;
  description: string;
  usage?: string;
}

// Plugin type union
export type PluginType = "core" | "service" | "interface";

// Base Plugin interface - shared by all plugin types
export interface BasePlugin {
  id: string;
  version: string;
  description?: string;
}

// Plugin capabilities (matching application pattern)
export interface PluginCapabilities {
  tools: PluginTool[];
  resources: PluginResource[];
  commands: Command[];
}

// Tool and Resource types (from application system)
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // ZodRawShape equivalent
  handler: (input: unknown) => Promise<unknown>;
}

export interface PluginResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<{
    contents: Array<{
      text: string;
      uri: string;
      mimeType?: string;
    }>;
  }>;
}

// Core Plugin - basic functionality
export interface CorePlugin extends BasePlugin {
  type: "core";
  register(context: CorePluginContext): Promise<PluginCapabilities>;
}

// Service Plugin - adds entity management and other services
export interface ServicePlugin extends BasePlugin {
  type: "service";
  register(context: ServicePluginContext): Promise<PluginCapabilities>;
}

// Interface Plugin - user interfaces (CLI, Matrix, Web)
export interface InterfacePlugin extends BasePlugin {
  type: "interface";
  register(context: InterfacePluginContext): Promise<PluginCapabilities>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// Core Plugin Context - provides services to core plugins
export interface CorePluginContext {
  // Identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Inter-plugin messaging
  sendMessage: MessageSender;
  subscribe: (channel: string, handler: MessageHandler) => () => void;

  // Template operations (lightweight, no AI generation)
  formatContent: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
  registerTemplates: (templates: Record<string, Template>) => void;
}

// Service Plugin Context - extends Core with service capabilities
export interface ServicePluginContext extends CorePluginContext {
  // Content generation (AI-powered, needs entity storage)
  generateContent: <T = unknown>(config: ContentGenerationConfig) => Promise<T>;

  // Full entity service access
  readonly entityService: EntityService;

  // Entity type registration
  registerEntityType<T extends BaseEntity>(
    entityType: string,
    schema: z.ZodSchema<T>,
    adapter: EntityAdapter<T>,
  ): void;

  // Job queue operations
  enqueueJob: (
    type: string,
    data: unknown,
    options: JobOptions,
  ) => Promise<string>;
  getJobStatus: (jobId: string) => Promise<JobQueue | null>;
  enqueueBatch: (
    operations: BatchOperation[],
    options: JobOptions,
  ) => Promise<string>;
  getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Batch[]>;
  registerJobHandler: (type: string, handler: JobHandler) => void;

  // Route and view registration
  registerRoutes: (
    routes: RouteDefinition[],
    options?: { environment?: string },
  ) => void;
  getViewTemplate: (name: string) => ViewTemplate | undefined;
  getRoute: (path: string) => RouteDefinition | undefined;
  listRoutes: () => RouteDefinition[];
  listViewTemplates: () => ViewTemplate[];

  // Plugin metadata access (for component generation/hydration)
  getPluginPackageName: (targetPluginId?: string) => string | undefined;
}

// Interface Plugin Context - extends Core with interface capabilities
export interface InterfacePluginContext extends CorePluginContext {
  // Query processing (uses knowledge-query template internally)
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;

  // Command discovery (metadata only, no handlers)
  listCommands: () => Promise<CommandInfo[]>;

  // Daemon support for long-running interfaces
  registerDaemon: (name: string, daemon: Daemon) => void;

  // Job monitoring (read-only for status updates)
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Batch[]>;
}
