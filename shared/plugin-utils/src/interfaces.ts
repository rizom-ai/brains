import { z, type ZodRawShape } from "zod";
import type {
  Logger,
  ProgressNotification,
  UserPermissionLevel,
} from "@brains/utils";
import type {
  BaseEntity,
  MessageHandler,
  MessageSender,
  Template,
} from "@brains/types";
import type { EntityAdapter } from "@brains/base-entity";
import type {
  RouteDefinition,
  SectionDefinition,
  ViewTemplate,
} from "@brains/view-registry";
import type { IEntityService } from "@brains/entity-service";

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
 * Plugin tool definition
 */
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  handler: (
    input: unknown,
    context?: {
      progressToken?: string | number;
      sendProgress?: (notification: ProgressNotification) => Promise<void>;
    },
  ) => Promise<unknown>;
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
}

/**
 * Plugin interface - combines validated metadata with the register function
 */
export type Plugin = z.infer<typeof pluginMetadataSchema> & {
  register(context: PluginContext): Promise<PluginCapabilities>;
};

/**
 * Plugin context passed to plugins during registration
 * Provides clean, minimal interface following principle of least privilege
 */
export interface PluginContext {
  pluginId: string;
  logger: Logger;
  sendMessage: MessageSender;
  subscribe: <T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ) => () => void;
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ) => void;
  generateContent: GenerateContentFunction;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
  formatContent: <T = unknown>(templateName: string, data: T) => string;
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

  // Async content generation - queues content generation jobs
  enqueueContentGeneration: (request: {
    templateName: string;
    context: {
      prompt?: string | undefined;
      data?: Record<string, unknown> | undefined;
    };
    userId?: string | undefined;
  }) => Promise<string>; // Returns job ID

  // Check status of content generation job
  getJobStatus: (jobId: string) => Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    result?: string;
    error?: string;
  } | null>;

  // Wait for job completion (with timeout)
  waitForJob: (jobId: string, timeoutMs?: number) => Promise<string>;

  // Interface plugin capabilities
  registerDaemon: (name: string, daemon: Daemon) => void;
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
   * Process user input and emit response/error events
   */
  processInput(input: string, context?: Partial<MessageContext>): Promise<void>;

  /**
   * EventEmitter methods for message interfaces
   */
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
}
