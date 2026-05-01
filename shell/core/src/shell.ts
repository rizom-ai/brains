// Plugin framework types
import type {
  RuntimeAppInfo,
  ContentGenerationConfig,
  DefaultQueryResponse,
  EndpointInfo,
  EvalHandler,
  IShell,
  Plugin,
  Resource,
  ResourceTemplate,
  Prompt,
  Tool,
  QueryContext,
  RegisteredApiRoute,
  RegisteredWebRoute,
} from "@brains/plugins";

// Plugin manager
import type { PluginManager } from "@brains/plugins";

// Entity service types
import type {
  DataSourceRegistry,
  IEntityRegistry,
  IEntityService,
} from "@brains/entity-service";

// Content service
import type { IContentService } from "@brains/content-service";

// Messaging
import type { IMessageBus } from "@brains/messaging-service";

// Identity
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import type {
  IAIService,
  IAgentService,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { Daemon } from "@brains/plugins";
import type {
  BatchJobStatus,
  IJobsNamespace,
  IJobQueueService,
} from "@brains/job-queue";
import type { IConversationService } from "@brains/conversation-service";
import type {
  PermissionService,
  RenderService,
  UserPermissionLevel,
} from "@brains/templates";
import type { IMCPService, ToolInfo } from "@brains/mcp-service";
import type { Template } from "@brains/templates";
import { Logger, type z } from "@brains/utils";

import { getRuntimeAppInfo } from "./app-info";
import type { ShellConfig, ShellConfigInput } from "./config";
import { createShellConfig } from "./config";
import { SHELL_TEMPLATE_NAMES } from "./constants";
import { registerCoreDataSources } from "./core-data-sources";
import { generateShellContent } from "./shell-content";
import {
  ShellInitializer,
  resetServiceSingletons,
  type ShellServices,
} from "./initialization/shellInitializer";
import { ShellBootloader } from "./initialization/shellBootloader";
import { createInsightsRegistry } from "./system/insights";
import type { IInsightsRegistry } from "@brains/plugins";
import { EndpointRegistry } from "./endpoint-registry";
import { createJobsNamespace } from "./jobs-namespace";
import {
  collectPluginApiRoutes,
  collectPluginWebRoutes,
} from "./plugin-routes";
import { shutdownShellServices } from "./shell-shutdown";
import { registerShellSystemCapabilities } from "./shell-system-capabilities";
import type { ShellDependencies } from "./types/shell-types";

export type { ShellDependencies };

export class Shell implements IShell {
  private static instance: Shell | null = null;
  private readonly services: ShellServices;
  private readonly bootloader: ShellBootloader;
  private initialized = false;
  private readonly insightsRegistry: IInsightsRegistry;
  private readonly bootTime = Date.now();
  private readonly endpointRegistry = new EndpointRegistry();

  public readonly jobs: IJobsNamespace;

  public static getInstance(config?: Partial<ShellConfig>): Shell {
    Shell.instance ??= new Shell(createShellConfig(config ?? {}));
    return Shell.instance;
  }

  public static async resetInstance(): Promise<void> {
    if (Shell.instance) {
      await Shell.instance.shutdown();
      Shell.instance = null;
    }
  }

  public static createFresh(
    config?: ShellConfigInput,
    dependencies?: ShellDependencies,
  ): Shell {
    // Reset all service singletons so this truly creates a fresh shell.
    // The caller must shutdown() any previous shell first to stop
    // background services; this handles the singleton references.
    resetServiceSingletons();
    const fullConfig = createShellConfig(config);
    return new Shell(fullConfig, dependencies);
  }

  private constructor(
    private config: ShellConfig,
    dependencies?: ShellDependencies,
  ) {
    const shellInitializer = ShellInitializer.getInstance(
      dependencies?.logger ?? Logger.getInstance(),
      this.config,
    );

    this.services = shellInitializer.initializeServices(dependencies);

    this.jobs = createJobsNamespace(
      this.services.batchJobManager,
      this.services.jobQueueService,
    );

    this.insightsRegistry = createInsightsRegistry();
    this.bootloader = new ShellBootloader(this.config, this.services, {
      registerCoreDataSources: (): void =>
        registerCoreDataSources(this.services, this.config),
      registerSystemCapabilities: (): void =>
        registerShellSystemCapabilities({
          services: this.services,
          jobs: this.jobs,
          insights: this.insightsRegistry,
          query: (prompt, context) => this.query(prompt, context),
          getAppInfo: () => this.getAppInfo(),
        }),
    });

    shellInitializer.wireShell(this.services, this);
  }

  public getInsightsRegistry(): IInsightsRegistry {
    return this.insightsRegistry;
  }

  /**
   * Initialize the shell.
   *
   * @param options.registerOnly - If true, only registers plugins and system
   *   capabilities (tools, resources, etc.) without emitting the internal
   *   plugins-registered coordination signal or starting background services.
   *   Used by CLI for command discovery.
   */
  public async initialize(options?: { registerOnly?: boolean }): Promise<void> {
    this.services.logger.debug("Shell.initialize() called");
    if (this.initialized) {
      this.services.logger.warn("Shell already initialized");
      return;
    }

    try {
      await this.bootloader.boot(options);
      this.initialized = true;
    } catch (error) {
      this.services.logger.error("Failed to initialize Shell", error);
      throw error;
    }
  }

  public registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void {
    this.services.logger.debug("Registering templates", {
      pluginId,
      count: Object.keys(templates).length,
    });

    for (const [name, template] of Object.entries(templates)) {
      this.registerTemplate(name, template, pluginId);
    }
  }

  public async shutdown(): Promise<void> {
    this.services.logger.debug("Shutting down Shell");
    await shutdownShellServices(this.services);
    this.initialized = false;
    this.services.logger.debug("Shell shutdown complete");
  }

  public async generateContent<T = unknown>(
    config: ContentGenerationConfig,
  ): Promise<T> {
    this.requireInitialized("Shell content generation");
    return generateShellContent<T>(this.services, config);
  }

  public async query(
    prompt: string,
    context?: QueryContext,
  ): Promise<DefaultQueryResponse> {
    this.requireInitialized("Shell query");

    const appInfo = await this.getAppInfo();
    const queryContext = {
      ...context,
      appInfo,
      timestamp: new Date().toISOString(),
    };

    const { conversationHistory, ...contextData } = queryContext;

    return this.generateContent<DefaultQueryResponse>({
      prompt,
      templateName: SHELL_TEMPLATE_NAMES.KNOWLEDGE_QUERY,
      ...(conversationHistory && { conversationHistory }),
      data: contextData,
      interfacePermissionGrant: "public",
    });
  }

  public registerPlugin(plugin: Plugin): void {
    this.requireInitialized("Plugin registration");
    this.services.pluginManager.registerPlugin(plugin);
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  private requireInitialized(operation: string): void {
    if (!this.initialized) {
      throw new Error(`${operation} attempted before initialization`);
    }
  }

  public getEntityService(): IEntityService {
    return this.services.entityService;
  }

  public getConversationService(): IConversationService {
    return this.services.conversationService;
  }

  public getEntityRegistry(): IEntityRegistry {
    return this.services.entityRegistry;
  }

  public async generateObject<T>(
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<{ object: T }> {
    this.requireInitialized("Shell generateObject");
    const { object } = await this.services.aiService.generateObject(
      "You are a helpful assistant. Respond with the requested structured data.",
      prompt,
      schema,
    );
    return { object };
  }

  public getAIService(): IAIService {
    return this.services.aiService;
  }

  public generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    return this.services.aiService.generateImage(prompt, options);
  }

  public canGenerateImages(): boolean {
    return this.services.aiService.canGenerateImages();
  }

  public getPluginManager(): PluginManager {
    return this.services.pluginManager;
  }

  public getContentService(): IContentService {
    return this.services.contentService;
  }

  public getRenderService(): RenderService {
    return this.services.renderService;
  }

  public getMessageBus(): IMessageBus {
    return this.services.messageBus;
  }

  public getLogger(): Logger {
    return this.services.logger;
  }

  public getJobQueueService(): IJobQueueService {
    return this.services.jobQueueService;
  }

  public getMCPService(): IMCPService {
    return this.services.mcpService;
  }

  public listToolsForPermissionLevel(level: UserPermissionLevel): ToolInfo[] {
    return this.services.mcpService
      .listToolsForPermissionLevel(level)
      .map(({ pluginId, tool }) => ({
        name: tool.name,
        description: tool.description,
        pluginId,
      }));
  }

  public getPermissionService(): PermissionService {
    return this.services.permissionService;
  }

  public getAgentService(): IAgentService {
    return this.services.agentService;
  }

  public registerTools(pluginId: string, tools: Tool[]): void {
    for (const tool of tools) {
      try {
        this.services.mcpService.registerTool(pluginId, tool);
      } catch (error) {
        this.services.logger.error(
          `Failed to register tool ${tool.name} from ${pluginId}:`,
          error,
        );
      }
    }
  }

  public registerResources(pluginId: string, resources: Resource[]): void {
    for (const resource of resources) {
      try {
        this.services.mcpService.registerResource(pluginId, resource);
      } catch (error) {
        this.services.logger.error(
          `Failed to register resource ${resource.name} from ${pluginId}:`,
          error,
        );
      }
    }
  }

  public registerResourceTemplate<K extends string = string>(
    pluginId: string,
    template: ResourceTemplate<K>,
  ): void {
    this.services.mcpService.registerResourceTemplate(pluginId, template);
  }

  public registerPrompt(pluginId: string, prompt: Prompt): void {
    this.services.mcpService.registerPrompt(pluginId, prompt);
  }

  public registerInstructions(pluginId: string, instructions: string): void {
    this.services.mcpService.registerInstructions(pluginId, instructions);
    if (this.initialized) {
      this.services.agentService.invalidateAgent();
    }
  }

  public getPluginPackageName(pluginId: string): string | undefined {
    return this.services.pluginManager.getPluginPackageName(pluginId);
  }

  public hasPlugin(id: string): boolean {
    return this.services.pluginManager.hasPlugin(id);
  }

  public getPluginApiRoutes(): RegisteredApiRoute[] {
    return collectPluginApiRoutes(this.services.pluginManager);
  }

  public getPluginWebRoutes(): RegisteredWebRoute[] {
    return collectPluginWebRoutes(this.services.pluginManager);
  }

  public registerDaemon(name: string, daemon: Daemon, pluginId: string): void {
    this.services.daemonRegistry.register(name, daemon, pluginId);
  }

  public registerEndpoint(endpoint: EndpointInfo): void {
    this.endpointRegistry.register(endpoint);
  }

  public listEndpoints(): EndpointInfo[] {
    return this.endpointRegistry.list();
  }

  public getPublicContext(): {
    entityService: ShellServices["entityService"];
    generateContent: <T = unknown>(
      config: ContentGenerationConfig,
    ) => Promise<T>;
    getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
  } {
    return {
      entityService: this.services.entityService,
      generateContent: <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => this.generateContent<T>(config),
      getBatchStatus: (batchId: string): Promise<BatchJobStatus | null> =>
        this.services.batchJobManager.getBatchStatus(batchId),
    };
  }

  public registerTemplate(
    name: string,
    template: Template,
    pluginId?: string,
  ): void {
    const scopedName = pluginId ? `${pluginId}:${name}` : `shell:${name}`;

    this.services.templateRegistry.register(scopedName, template);
    this.services.logger.debug(`Registered template: ${scopedName}`);
  }

  public getTemplate(name: string): Template | undefined {
    return this.services.templateRegistry.get(name);
  }

  public getDataSourceRegistry(): DataSourceRegistry {
    return this.services.dataSourceRegistry;
  }

  public getIdentity(): BrainCharacter {
    return this.services.identityService.getCharacter();
  }

  public getProfile(): AnchorProfile {
    return this.services.profileService.getProfile();
  }

  public getDomain(): string | undefined {
    return this.config.siteBaseUrl;
  }

  public getDataDir(): string {
    return this.config.dataDir;
  }

  public registerEvalHandler(
    pluginId: string,
    handlerId: string,
    handler: EvalHandler,
  ): void {
    this.config.evalHandlerRegistry?.register(pluginId, handlerId, handler);
  }

  public async getAppInfo(): Promise<RuntimeAppInfo> {
    return getRuntimeAppInfo({
      config: this.config,
      services: this.services,
      bootTime: this.bootTime,
      endpoints: () => this.listEndpoints(),
    });
  }
}
