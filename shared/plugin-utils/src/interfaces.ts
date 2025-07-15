import { z, type ZodRawShape } from "zod";
import type {
  Logger,
  ProgressNotification,
  UserPermissionLevel,
} from "@brains/utils";
import type { BaseEntity, Template } from "@brains/types";
import type { MessageSender } from "@brains/messaging-service";
import type { IMessageBus } from "@brains/messaging-service";
import type { EntityAdapter } from "@brains/types";
import type { Command } from "@brains/message-interface";
import type {
  RouteDefinition,
  SectionDefinition,
  ViewTemplate,
} from "@brains/view-registry";
import type { IEntityService } from "@brains/entity-service";
import type {
  JobStatusType,
  JobHandler,
} from "@brains/job-queue";
import type { JobOptions } from "@brains/db";

/**
 * Plugin metadata schema - validates the data portion of a plugin
 */
export const pluginMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  packageName: z.string(), // Package name for import resolution (e.g., "@brains/site-builder-plugin")
});

/**
 * Daemon health status schema
 */
export const DaemonHealthSchema = z.object({
  status: z.enum(["healthy", "warning", "error", "unknown"]),
  message: z.string().optional(),
  lastCheck: z.date().optional(),
  details: z.record(z.unknown()).optional(),
});

export type DaemonHealth = z.infer<typeof DaemonHealthSchema>;

/**
 * Daemon interface for long-running interface processes
 */
export interface Daemon {
  /**
   * Start the daemon - called when plugin is initialized
   */
  start: () => Promise<void>;

  /**
   * Stop the daemon - called when plugin is unloaded/shutdown
   */
  stop: () => Promise<void>;

  /**
   * Optional health check - called periodically to monitor daemon health
   */
  healthCheck?: () => Promise<DaemonHealth>;
}

/**
 * Tool visibility levels for permission control
 * Uses the same levels as UserPermissionLevel for consistency
 */
export type ToolVisibility = UserPermissionLevel;

/**
 * Tool execution context
 * Provides progress reporting and routing metadata
 */
export interface ToolContext {
  // Progress reporting
  progressToken?: string | number;
  sendProgress?: (notification: ProgressNotification) => Promise<void>;

  // Routing metadata for job creation
  interfaceId?: string; // Which interface called the tool (e.g., "mcp", "cli", "matrix")
  userId?: string; // User who invoked the tool
  channelId?: string; // Channel/room context (for Matrix, etc.)
}

/**
 * Schema for ToolContext routing metadata
 * Used to validate routing information in tool execution requests
 */
export const ToolContextRoutingSchema = z.object({
  interfaceId: z.string().optional(),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

/**
 * Plugin tool definition
 */
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  handler: (input: unknown, context?: ToolContext) => Promise<unknown>;
  visibility?: ToolVisibility; // Default: "anchor" for safety - only explicitly marked tools are public
}

/**
 * Plugin resource definition
 */
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

/**
 * Plugin capabilities that can be exposed
 */
export interface PluginCapabilities {
  tools: PluginTool[];
  resources: PluginResource[];
  commands: Command[];
}

/**
 * Plugin interface - combines validated metadata with the register function
 */
export type Plugin = z.infer<typeof pluginMetadataSchema> & {
  register(context: PluginContext): Promise<PluginCapabilities>;
  getCommands(): Promise<Command[]>;
};

/**
 * Plugin context passed to plugins during registration
 * Provides clean, minimal interface following principle of least privilege
 */
export interface PluginContext extends Pick<IMessageBus, "subscribe"> {
  pluginId: string;
  logger: Logger;
  sendMessage: MessageSender;
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ) => void;
  generateContent: GenerateContentFunction;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
  formatContent: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;
  generateWithRoute: (
    route: RouteDefinition,
    section: SectionDefinition,
    progressInfo: { current: number; total: number; message: string },
    additionalContext?: Record<string, unknown>,
  ) => Promise<string>;
  // Unified template registration - registers template for both content generation and view rendering
  registerTemplate: <T>(name: string, template: Template<T>) => void;
  // Convenience method for registering multiple templates at once
  registerTemplates: (templates: Record<string, Template>) => void;
  // Route registration
  registerRoutes: (
    routes: RouteDefinition[],
    options?: { environment?: string },
  ) => void;
  // View template access (replaces direct viewRegistry access)
  getViewTemplate: (name: string) => ViewTemplate | undefined;

  // Route finding abstraction
  getRoute: (path: string) => RouteDefinition | undefined;
  findRoute: (filter: {
    id?: string;
    pluginId?: string;
    pathPattern?: string;
  }) => RouteDefinition | undefined;
  listRoutes: () => RouteDefinition[]; // for tool use only
  validateRoute: (route: RouteDefinition) => boolean;

  // Template finding abstraction
  findViewTemplate: (filter: {
    name?: string;
    pluginId?: string;
    namePattern?: string;
  }) => ViewTemplate | undefined;
  listViewTemplates: () => ViewTemplate[]; // for tool use only
  validateTemplate: (templateName: string, content: unknown) => boolean;
  // Plugin metadata access (scoped to current plugin by default)
  getPluginPackageName: (pluginId?: string) => string | undefined;
  // Entity service access - direct access to public service interface
  entityService: IEntityService;

  // Wait for job completion (with timeout)
  waitForJob: (jobId: string, timeoutMs?: number) => Promise<unknown>;

  // Generic job queue access (required)
  enqueueJob: (
    type: string,
    data: unknown,
    options: JobOptions,
  ) => Promise<string>;

  getJobStatus: (jobId: string) => Promise<{
    status: JobStatusType;
    result?: unknown;
    error?: string;
  } | null>;

  // Batch operations (required)
  enqueueBatch: (
    operations: Array<{
      type: string;
      entityId?: string;
      entityType?: string;
      options?: Record<string, unknown>;
    }>,
    options: JobOptions,
  ) => Promise<string>;


  // Job handler registration (for plugins that process jobs)
  registerJobHandler: (type: string, handler: JobHandler) => void;

  // Interface plugin capabilities
  registerDaemon: (name: string, daemon: Daemon) => void;

  // Command discovery - get commands from all registered plugins
  getAllCommands: () => Promise<Command[]>;
}

/**
 * Interface plugin type - extends Plugin with start/stop lifecycle methods
 * Used as base for all interface implementations (CLI, Matrix, etc.)
 */
export interface IInterfacePlugin extends Plugin {
  /**
   * Start the interface
   */
  start(): Promise<void>;

  /**
   * Stop the interface
   */
  stop(): Promise<void>;
}

/**
 * Message context for message-based interfaces
 */
export interface MessageContext {
  userId: string;
  channelId: string;
  messageId: string;
  threadId?: string;
  timestamp: Date;
  interfaceType: string; // The type of interface processing this message (set to pluginId: "cli", "matrix", etc.)
  userPermissionLevel?: UserPermissionLevel; // Permission level in this specific context (room/channel)
}

/**
 * Content generation configuration - unified config object
 */
export interface ContentGenerationConfig {
  prompt: string;
  templateName: string;
  userId?: string;
  data?: Record<string, unknown>;
  interfacePermissionGrant?: UserPermissionLevel;
}

/**
 * Content generation function signature - used by both PluginContext and Shell
 */
export type GenerateContentFunction = <T = unknown>(
  config: ContentGenerationConfig,
) => Promise<T>;

/**
 * Message-based interface plugin type - extends IInterfacePlugin
 * Used for interfaces that process messages (CLI, Matrix, etc.)
 */
export interface IMessageInterfacePlugin extends IInterfacePlugin {
  /**
   * The unique session ID for this interface instance
   */
  readonly sessionId: string;

  /**
   * Process user input with context
   */
  processInput(input: string, context?: Partial<MessageContext>): Promise<void>;
}
