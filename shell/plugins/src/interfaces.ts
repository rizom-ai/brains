import { z, type ZodRawShape } from "zod";
import type { ProgressNotification } from "@brains/utils";
import type { UserPermissionLevel } from "@brains/permission-service";
import {
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
  type DefaultQueryResponse,
  type SimpleTextResponse,
  type CreateEntityResponse,
  type UpdateEntityResponse,
} from "@brains/utils";
import type { Command } from "@brains/command-registry";
import type { IMessageBus } from "@brains/messaging-service";
import type { IContentService } from "@brains/content-service";
import type { Template } from "@brains/templates";
import type { Logger } from "@brains/utils";
import type { IEntityService, EntityRegistry } from "@brains/entity-service";
import type {
  JobQueueService,
  Batch,
  BatchJobStatus,
  BatchOperation,
} from "@brains/job-queue";
import type { JobOptions, JobQueue } from "@brains/job-queue";
import type { CommandRegistry } from "@brains/command-registry";
import type { RenderService } from "@brains/render-service";
import type { IConversationService } from "@brains/conversation-service";
import type { IMCPTransport } from "@brains/mcp-service";
import type { PermissionService } from "@brains/permission-service";
import type { DataSourceRegistry } from "@brains/datasource";

/**
 * Query context for shell queries
 */
export interface QueryContext {
  userId?: string;
  conversationHistory?: string;
  messageId?: string;
  threadId?: string;
  timestamp?: string;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Shell interface that plugins use to access core services
 * This avoids circular dependencies between core and plugin-context
 */
export interface IShell {
  // Core service accessors
  getMessageBus(): IMessageBus;
  getContentService(): IContentService;
  getLogger(): Logger;
  getEntityService(): IEntityService;
  getEntityRegistry(): EntityRegistry;
  getJobQueueService(): JobQueueService;
  getCommandRegistry(): CommandRegistry;
  getRenderService(): RenderService;
  getConversationService(): IConversationService;
  getMcpTransport(): IMCPTransport;
  getPermissionService(): PermissionService;
  getDataSourceRegistry(): DataSourceRegistry;

  // High-level operations
  generateContent<T = unknown>(config: ContentGenerationConfig): Promise<T>;
  query(prompt: string, context?: QueryContext): Promise<DefaultQueryResponse>;
  registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void;
  getTemplate(name: string): Template | undefined;

  // Plugin capability registration
  registerPluginCommands(pluginId: string, commands: Command[]): void;
  registerPluginTools(pluginId: string, tools: PluginTool[]): void;
  registerPluginResources(pluginId: string, resources: PluginResource[]): void;

  // Plugin information
  getPluginPackageName(pluginId: string): string | undefined;

  // Batch job operations
  enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    batchId: string,
    pluginId: string,
  ): Promise<string>;
  getActiveBatches(): Promise<Batch[]>;
  getBatchStatus(batchId: string): Promise<BatchJobStatus | null>;
  getActiveJobs(types?: string[]): Promise<JobQueue[]>;
  getJobStatus(jobId: string): Promise<JobQueue | null>;

  // Daemon registration
  registerDaemon(name: string, daemon: Daemon, pluginId: string): void;
}

/**
 * System event schemas for plugin capability registration
 */
export const systemCommandRegisterSchema = z.object({
  pluginId: z.string(),
  command: z.object({
    name: z.string(),
    description: z.string(),
    usage: z.string().optional(),
    handler: z.function(),
  }),
  timestamp: z.number(),
});

export const systemToolRegisterSchema = z.object({
  pluginId: z.string(),
  tool: z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.unknown()), // ZodRawShape
    handler: z.function(),
    visibility: z.enum(["public", "trusted", "anchor"]).optional(),
  }),
  timestamp: z.number(),
});

export const systemResourceRegisterSchema = z.object({
  pluginId: z.string(),
  resource: z.object({
    uri: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    handler: z.function(),
  }),
  timestamp: z.number(),
});

export type SystemCommandRegisterEvent = z.infer<
  typeof systemCommandRegisterSchema
>;
export type SystemToolRegisterEvent = z.infer<typeof systemToolRegisterSchema>;
export type SystemResourceRegisterEvent = z.infer<
  typeof systemResourceRegisterSchema
>;

// Re-export response schemas for backward compatibility
export {
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
  type DefaultQueryResponse,
  type SimpleTextResponse,
  type CreateEntityResponse,
  type UpdateEntityResponse,
};

// Re-export MCP transport interface
export type { IMCPTransport } from "@brains/mcp-service";
// Re-export Command type for plugin implementations
export type { Command } from "@brains/command-registry";

/**
 * Plugin type enumeration
 */
export type PluginType = "core" | "service" | "interface";

/**
 * Base tracking info that all interface plugins must have
 * Contains the essential rootJobId for job inheritance tracking
 */
export interface BaseJobTrackingInfo {
  rootJobId: string; // For inheritance tracking (required)
}

/**
 * Plugin metadata schema - validates the data portion of a plugin
 */
export const pluginMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  type: z.enum(["core", "service", "interface"] as const), // Required field for plugin type
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

  // Routing metadata for job creation (required for proper context propagation)
  interfaceType: string; // Which interface called the tool (e.g., "mcp", "cli", "matrix")
  userId: string; // User who invoked the tool
  channelId?: string; // Channel/room context (for Matrix, etc.)
}

/**
 * Schema for ToolContext routing metadata
 * Used to validate routing information in tool execution requests
 */
export const ToolContextRoutingSchema = z.object({
  interfaceType: z.string(),
  userId: z.string(),
  channelId: z.string().optional(),
});

/**
 * Base tool response schema
 * TODO: This can be extended with discriminated unions for different response types
 */
export const toolResponseSchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    success: z.boolean().optional(),
    data: z.record(z.unknown()).optional(), // Generic data object
  })
  .passthrough(); // Allow additional fields

export type ToolResponse = z.infer<typeof toolResponseSchema>;

/**
 * Plugin tool definition
 */
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  handler: (input: unknown, context: ToolContext) => Promise<ToolResponse>;
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
  register(shell: IShell): Promise<PluginCapabilities>;
  shutdown?(): Promise<void>;
};

/**
 * Content generation configuration - unified config object
 */
export interface ContentGenerationConfig {
  prompt: string;
  templateName: string;
  conversationHistory?: string;
  data?: Record<string, unknown>;
  interfacePermissionGrant?: UserPermissionLevel;
}

/**
 * Content generation function signature - used by both PluginContext and Shell
 */
export type GenerateContentFunction = <T = unknown>(
  config: ContentGenerationConfig,
) => Promise<T>;
