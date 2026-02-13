import { z } from "@brains/utils";
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
import type { IMessageBus } from "@brains/messaging-service";
import type { Daemon } from "@brains/daemon-registry";
import type { IContentService } from "@brains/content-service";
import type { Template } from "@brains/templates";
import type { Logger } from "@brains/utils";
import type { IEntityService, IEntityRegistry } from "@brains/entity-service";
import type { PluginTool, PluginResource } from "@brains/mcp-service";
export type {
  ToolVisibility,
  ToolContext,
  ToolResponse,
  PluginTool,
  PluginResource,
} from "@brains/mcp-service";
export {
  toolResponseSchema,
  ToolContextRoutingSchema,
} from "@brains/mcp-service";
import type { IJobQueueService, IJobsNamespace } from "@brains/job-queue";
import type { RenderService } from "@brains/render-service";
import type { IConversationService } from "@brains/conversation-service";
import type { IMCPTransport } from "@brains/mcp-service";
import type { PermissionService } from "@brains/permission-service";
import type { DataSourceRegistry } from "@brains/datasource";
import type { IdentityBody } from "@brains/identity-service";
import type { ProfileBody } from "@brains/profile-service";
import { DaemonStatusInfoSchema } from "@brains/daemon-registry";
import type { IAgentService } from "@brains/agent-service";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { RegisteredApiRoute } from "./types/api-routes";

/**
 * Handler function for plugin evaluations
 * Plugins register these to enable direct (non-chat) testing
 */
export type EvalHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

/**
 * Registry interface for plugin eval handlers
 * Abstraction that allows dependency inversion - implementation lives in ai-evaluation
 */
export interface IEvalHandlerRegistry {
  register(pluginId: string, handlerId: string, handler: EvalHandler): void;
  get(pluginId: string, handlerId: string): EvalHandler | undefined;
  has(pluginId: string, handlerId: string): boolean;
  list(): Array<{ pluginId: string; handlerId: string }>;
  unregister(pluginId: string, handlerId: string): boolean;
}

/**
 * Plugin info for status display
 */
export const pluginInfoSchema = z.object({
  id: z.string(),
  type: z.string(),
  version: z.string(),
  status: z.string(),
});

/**
 * Tool info for status display
 */
export const toolInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
});

/**
 * App info schema for validation
 */
export const appInfoSchema = z.object({
  model: z.string(),
  version: z.string(),
  plugins: z.array(pluginInfoSchema),
  interfaces: z.array(DaemonStatusInfoSchema),
  tools: z.array(toolInfoSchema).optional(),
});

export type AppInfo = z.infer<typeof appInfoSchema>;

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
  getEntityRegistry(): IEntityRegistry;
  getJobQueueService(): IJobQueueService;
  getRenderService(): RenderService;
  getConversationService(): IConversationService;
  getMcpTransport(): IMCPTransport;
  getPermissionService(): PermissionService;
  getDataSourceRegistry(): DataSourceRegistry;
  getAgentService(): IAgentService;

  // Identity and Profile
  getIdentity(): IdentityBody;
  getProfile(): ProfileBody;

  // Data directory - where plugins should store entity files
  // Default: ./brain-data, can be overridden for evals or custom deployments
  getDataDir(): string;

  // App metadata
  getAppInfo(): Promise<AppInfo>;

  // High-level operations
  generateContent<T = unknown>(config: ContentGenerationConfig): Promise<T>;
  generateObject<T>(
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<{ object: T }>;
  query(prompt: string, context?: QueryContext): Promise<DefaultQueryResponse>;

  // Image generation (requires OPENAI_API_KEY)
  generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;
  canGenerateImages(): boolean;

  registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void;
  getTemplate(name: string): Template | undefined;

  // Plugin capability registration
  registerPluginTools(pluginId: string, tools: PluginTool[]): void;
  registerPluginResources(pluginId: string, resources: PluginResource[]): void;

  // Plugin information
  getPluginPackageName(pluginId: string): string | undefined;

  // Job operations namespace
  readonly jobs: IJobsNamespace;

  // Daemon registration
  registerDaemon(name: string, daemon: Daemon, pluginId: string): void;

  // Eval handler registration for plugin testing
  registerEvalHandler(
    pluginId: string,
    handlerId: string,
    handler: EvalHandler,
  ): void;

  // API routes from plugins
  getPluginApiRoutes(): RegisteredApiRoute[];
}

/**
 * System event schemas for plugin capability registration
 */
export const systemToolRegisterSchema = z.object({
  pluginId: z.string(),
  tool: z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.string(), z.unknown()), // ZodRawShape
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
