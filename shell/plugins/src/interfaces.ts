import { z } from "@brains/utils/zod";
import type {
  EntityActionPolicyConfig,
  UserPermissionLevel,
} from "@brains/templates";
import {
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
  type DefaultQueryResponse,
  type SimpleTextResponse,
  type CreateEntityResponse,
  type UpdateEntityResponse,
} from "@brains/contracts";
import type { IMessageBus } from "@brains/messaging-service";
import type { Daemon } from "./manager/daemon-types";
import type { IContentService } from "@brains/content-service";
import type { Template } from "@brains/templates";
import type { Logger } from "@brains/utils/logger";
import type {
  ContentVisibility,
  IEntityService,
  IEntityRegistry,
  ICoreEntityService,
} from "@brains/entity-service";
import type {
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  ToolInfo,
} from "@brains/mcp-service";
export type {
  ToolVisibility,
  DirectMcpExposure,
  ToolContext,
  ToolResponse,
  ToolConfirmation,
  Tool,
  Resource,
  ResourceTemplate,
  Prompt,
  ToolInfo,
} from "@brains/mcp-service";
export {
  toolResponseSchema,
  ToolContextRoutingSchema,
} from "@brains/mcp-service";
import type { IJobQueueService, IJobsNamespace } from "@brains/job-queue";
import type { RenderService } from "@brains/templates";
import type { IConversationService } from "@brains/conversation-service";
import type { IMCPTransport } from "@brains/mcp-service";
import type { PermissionService } from "@brains/templates";
import type { DataSourceRegistry } from "@brains/entity-service";
import type { IChannelRegistry } from "./channel-registry";
import type { IInboxRegistry } from "./inbox-registry";
import type { IInboxFollowUpRegistry } from "./inbox-follow-up-registry";
import type { IOperationalHealthRegistry } from "./operational-health-registry";
import type { AccountSettingsRegistry } from "./operator/account-settings-registry";
import type {
  AnchorProfile,
  BrainCharacter,
  IProfileKindRegistry,
} from "@brains/identity-service";
import type { IAgentService } from "@brains/ai-service";
import type { IAttachmentsNamespace } from "./service/attachment-registry";
import type { IRecurringChecksNamespace } from "@brains/recurring-checks";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { IRuntimeUploadsNamespace } from "./service/upload-registry";
import type { RuntimeReadiness } from "./contracts/runtime-health";
import type { ProjectionRule } from "./entity/projection-rule";
import type {
  AIGenerationSchema,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type {
  ApiRouteDefinition,
  RegisteredApiRoute,
} from "./types/api-routes";
import type {
  RegisteredWebRoute,
  WebRouteDefinition,
} from "./types/web-routes";
import type { EntityDisplayEntry } from "@brains/site-composition";
import {
  appInfoSchema,
  backgroundWorkInfoSchema,
  endpointInfoSchema,
  entityCountSchema,
  interactionInfoSchema,
  interactionKindSchema,
  interactionStatusSchema,
} from "./contracts/runtime-app-info";
import type {
  BackgroundWorkInfo,
  EndpointInfo,
  EndpointInfoInput,
  EntityCount,
  InteractionInfo,
  InteractionInfoInput,
  RuntimeAppInfo,
} from "./contracts/runtime-app-info";
import type { EvalHandler, InsightHandler } from "./contracts/handlers";
import type {
  ContentGenerationConfig,
  GenerateContentFunction,
  GenerationStyleGuide,
} from "./contracts/generation";

export {
  appInfoSchema,
  backgroundWorkInfoSchema,
  endpointInfoSchema,
  entityCountSchema,
  interactionInfoSchema,
  interactionKindSchema,
  interactionStatusSchema,
};
export type {
  BackgroundWorkInfo,
  ContentGenerationConfig,
  EndpointInfo,
  EndpointInfoInput,
  EntityCount,
  EvalHandler,
  GenerateContentFunction,
  GenerationStyleGuide,
  InsightHandler,
  InteractionInfo,
  InteractionInfoInput,
  RuntimeAppInfo,
};

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
export const pluginInfoSchema: z.ZodObject<{
  id: z.ZodString;
  type: z.ZodString;
  version: z.ZodString;
  status: z.ZodString;
}> = z.object({
  id: z.string(),
  type: z.string(),
  version: z.string(),
  status: z.string(),
});

/**
 * Tool info for status display
 */
export const toolInfoSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
}> = z.object({
  name: z.string(),
  description: z.string(),
});

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
 * Bounded model-as-judge request exposed to plugins.
 * Kept structural here so public plugin declarations do not import ai-service internals.
 */
export interface JudgeInput<T> {
  instruction: string;
  material: string;
  schema: AIGenerationSchema<T>;
}

/**
 * Shell interface that plugins use to access core services
 * This avoids circular dependencies between core and plugin-context
 */
/**
 * Registry for insight types.
 * Core registers generic insights; plugins register domain-specific ones.
 */
export interface IInsightsRegistry {
  register(type: string, handler: InsightHandler): void;
  unregister(type: string): void;
  getTypes(): string[];
  get(
    type: string,
    entityService: ICoreEntityService,
    visibilityScope: ContentVisibility,
  ): Promise<Record<string, unknown>>;
}

export interface PluginRegistrationContext {
  /** Site/entity display metadata derived from the active site package. */
  readonly entityDisplay?: Record<string, EntityDisplayEntry>;
  /** Internal registration boundary for the supervised worker process. */
  readonly executionOnly?: boolean;
}

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
  getMCPService(): IMCPTransport;
  listToolsForPermissionLevel(level: UserPermissionLevel): ToolInfo[];
  getPermissionService(): PermissionService;
  getDataSourceRegistry(): DataSourceRegistry;
  getAgentService(): IAgentService;
  getAttachmentRegistry(): IAttachmentsNamespace;
  getRuntimeUploadRegistry(): IRuntimeUploadsNamespace;
  getRuntimeState(): IRuntimeStateNamespace;
  getRecurringChecks(pluginId: string): IRecurringChecksNamespace;

  // Identity and Profile
  getIdentity(): BrainCharacter;
  getProfile(): AnchorProfile;
  getProfileKindRegistry(): IProfileKindRegistry;
  getChannelRegistry(): IChannelRegistry;
  getInboxRegistry(): IInboxRegistry;
  getInboxFollowUpRegistry(): IInboxFollowUpRegistry;
  getOperationalHealthRegistry(): IOperationalHealthRegistry;
  getAccountSettingsRegistry(): AccountSettingsRegistry;

  // Domain — bare domain string (e.g. "yeehaa.io"), undefined for local dev
  getDomain(): string | undefined;
  getLocalSiteUrl(): string | undefined;
  shouldPreferLocalUrls(): boolean;
  getThemeCSS(): string;

  // Shared conversation spaces for this brain/team
  getSpaces(): string[];

  // Data directory - where plugins should store entity files
  // Default: ./brain-data, can be overridden for evals or custom deployments
  getDataDir(): string;

  // Where the Git checkout owner listens, when this Brain has one.
  // Assigned by the supervisor; undefined for a Brain without Git.
  getGitBrokerSocket(): string | undefined;
  getGitBrokerCheckout(): string | undefined;

  // App metadata and runtime health
  getAppInfo(): Promise<RuntimeAppInfo>;
  getRuntimeReadiness(): Promise<RuntimeReadiness>;

  // High-level operations
  generateContent<T = unknown>(config: ContentGenerationConfig): Promise<T>;
  generateObject<T>(
    prompt: string,
    schema: AIGenerationSchema<T>,
    signal?: AbortSignal,
  ): Promise<{ object: T }>;
  judge<T>(input: JudgeInput<T>): Promise<{
    verdict: T;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
  query(prompt: string, context?: QueryContext): Promise<DefaultQueryResponse>;

  // Image generation (requires AI_API_KEY)
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
  registerTools(pluginId: string, tools: Tool[]): void;
  registerResources(pluginId: string, resources: Resource[]): void;
  registerResourceTemplate<K extends string = string>(
    pluginId: string,
    template: ResourceTemplate<K>,
  ): void;
  registerPrompt(pluginId: string, prompt: Prompt): void;
  registerInstructions(pluginId: string, instructions: string): void;
  /** @internal Release capabilities owned by a terminally stopped plugin. */
  unregisterPluginCapabilities?(pluginId: string): void | Promise<void>;

  // Plugin information
  getPluginPackageName(pluginId: string): string | undefined;
  hasPlugin(id: string): boolean;

  // Job operations namespace
  readonly jobs: IJobsNamespace;

  // Daemon registration
  registerDaemon(name: string, daemon: Daemon, pluginId: string): void;

  // Endpoint advertisement — plugins advertise user-facing URLs
  registerEndpoint(endpoint: EndpointInfoInput): void;
  listEndpoints(): EndpointInfo[];

  // Interaction advertisement — plugins advertise user/agent entry points
  registerInteraction(interaction: InteractionInfoInput): void;
  listInteractions(): InteractionInfo[];

  // Eval handler registration for plugin testing
  registerEvalHandler(
    pluginId: string,
    handlerId: string,
    handler: EvalHandler,
  ): void;

  // Insights registry for plugin-contributed insights
  getInsightsRegistry(): IInsightsRegistry;

  // API routes from plugins
  getPluginApiRoutes(): RegisteredApiRoute[];

  // Web routes from plugins
  getPluginWebRoutes(): RegisteredWebRoute[];
}

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
export type PluginType = "core" | "entity" | "service" | "interface";

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
export const pluginMetadataSchema: z.ZodObject<{
  id: z.ZodString;
  version: z.ZodString;
  type: z.ZodEnum<{
    core: "core";
    entity: "entity";
    service: "service";
    interface: "interface";
  }>;
  description: z.ZodOptional<z.ZodString>;
  dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
  packageName: z.ZodString;
}> = z.object({
  id: z.string(),
  version: z.string(),
  type: z.enum(["core", "entity", "service", "interface"] as const), // Required field for plugin type
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  packageName: z.string(), // Package name for import resolution (e.g., "@brains/site-builder-plugin")
});

/**
 * Plugin capabilities that can be exposed
 */
export interface PluginCapabilities {
  tools: Tool[];
  resources: Resource[];
  instructions?: string;
  /** Immutable scheduler-owned executable projection capabilities. */
  projectionRules?: ProjectionRule[];
}

/**
 * Plugin interface - combines validated metadata with the register function
 */
export type Plugin = z.output<typeof pluginMetadataSchema> & {
  entityActionPolicy?: EntityActionPolicyConfig;
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities>;
  finalizeRegistration?(): Promise<void>;
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
  requiresDaemonStartup?(): boolean;
  getApiRoutes?(): ApiRouteDefinition[];
  getWebRoutes?(): WebRouteDefinition[];
};
