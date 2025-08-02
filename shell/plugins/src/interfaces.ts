import { z, type ZodRawShape } from "zod";
import type { ProgressNotification, UserPermissionLevel } from "@brains/utils";
import type { Command } from "@brains/command-registry";
import type { IMessageBus } from "@brains/messaging-service";
import type { IContentGenerator, Template } from "@brains/content-generator";
import type { Logger } from "@brains/utils";
import type { IEntityService, EntityRegistry } from "@brains/entity-service";
import type { JobQueueService } from "@brains/job-queue";
import type { CommandRegistry } from "@brains/command-registry";
import type { ViewRegistry, RouteDefinition } from "@brains/view-registry";
import type { ServiceRegistry } from "@brains/service-registry";

/**
 * Shell interface that plugins use to access core services
 * This avoids circular dependencies between core and plugin-context
 */
export interface IShell {
  // Core service accessors
  getMessageBus(): IMessageBus;
  getContentGenerator(): IContentGenerator;
  getLogger(): Logger;
  getEntityService(): IEntityService;
  getEntityRegistry(): EntityRegistry;
  getJobQueueService(): JobQueueService;
  getCommandRegistry(): CommandRegistry;
  getViewRegistry(): ViewRegistry;
  getServiceRegistry(): ServiceRegistry;

  // High-level operations
  generateContent<T = unknown>(config: ContentGenerationConfig): Promise<T>;
  registerRoutes(
    routes: RouteDefinition[],
    options?: { pluginId?: string; environment?: string },
  ): void;
  registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void;

  // Plugin information
  getPluginPackageName(pluginId: string): string | undefined;
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

/**
 * Query response schemas used by plugins
 */
export const defaultQueryResponseSchema = z
  .object({
    message: z.string().describe("Natural language response to the query"),
    summary: z.string().optional().describe("Brief summary if applicable"),
    topics: z.array(z.string()).optional().describe("Related topics mentioned"),
    sources: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          excerpt: z.string().optional(),
          relevance: z.number().min(0).max(1).optional(),
        }),
      )
      .optional()
      .describe("Source entities used to answer the query"),
    metadata: z.record(z.unknown()).optional(),
  })
  .describe("defaultQueryResponse");

export type DefaultQueryResponse = z.infer<typeof defaultQueryResponseSchema>;

export const simpleTextResponseSchema = z
  .object({
    message: z.string(),
  })
  .describe("simpleTextResponse");

export type SimpleTextResponse = z.infer<typeof simpleTextResponseSchema>;

export const createEntityResponseSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string().optional(),
    message: z.string(),
  })
  .describe("createEntityResponse");

export type CreateEntityResponse = z.infer<typeof createEntityResponseSchema>;

export const updateEntityResponseSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    changes: z.array(z.string()).optional(),
    message: z.string(),
  })
  .describe("updateEntityResponse");

export type UpdateEntityResponse = z.infer<typeof updateEntityResponseSchema>;

/**
 * Plugin type enumeration
 */
export type PluginType = "core" | "service" | "interface";

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
  register(shell: IShell): Promise<PluginCapabilities>;
  shutdown?(): Promise<void>;
};

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
