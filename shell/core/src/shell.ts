// Plugin framework types
import type {
  AppInfo,
  ContentGenerationConfig,
  DefaultQueryResponse,
  EvalHandler,
  IShell,
  Plugin,
  Resource,
  ResourceTemplate,
  Prompt,
  Tool,
  QueryContext,
  RegisteredApiRoute,
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

import type { ShellConfig, ShellConfigInput } from "./config";
import { createShellConfig } from "./config";
import { SHELL_TEMPLATE_NAMES } from "./constants";
import { AIContentDataSource, EntityDataSource } from "./datasources";
import {
  ShellInitializer,
  resetServiceSingletons,
  type ShellServices,
} from "./initialization/shellInitializer";
import { registerSystemCapabilities } from "./system/register";
import { createInsightsRegistry } from "./system/insights";
import type { IInsightsRegistry } from "@brains/plugins";
import {
  createEnqueueJobFn,
  createEnqueueBatchFn,
  createRegisterHandlerFn,
} from "@brains/job-queue";
import type { ShellDependencies } from "./types/shell-types";

export type { ShellDependencies };

export class Shell implements IShell {
  private static instance: Shell | null = null;
  private readonly services: ShellServices;
  private initialized = false;
  private readonly insightsRegistry: IInsightsRegistry;

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

    this.jobs = {
      enqueueBatch: this.services.batchJobManager.enqueueBatch.bind(
        this.services.batchJobManager,
      ),
      getActiveBatches: this.services.batchJobManager.getActiveBatches.bind(
        this.services.batchJobManager,
      ),
      getBatchStatus: this.services.batchJobManager.getBatchStatus.bind(
        this.services.batchJobManager,
      ),
      getActiveJobs: this.services.jobQueueService.getActiveJobs.bind(
        this.services.jobQueueService,
      ),
      getStatus: this.services.jobQueueService.getStatus.bind(
        this.services.jobQueueService,
      ),
    };

    this.insightsRegistry = createInsightsRegistry();

    shellInitializer.wireShell(this.services, this);
  }

  public getInsightsRegistry(): IInsightsRegistry {
    return this.insightsRegistry;
  }

  /**
   * Initialize the shell.
   *
   * @param options.registerOnly - If true, only registers plugins and system
   *   capabilities (tools, resources, etc.) without emitting system:plugins:ready
   *   or starting background services. Used by CLI for command discovery.
   */
  public async initialize(options?: { registerOnly?: boolean }): Promise<void> {
    this.services.logger.debug("Shell.initialize() called");
    if (this.initialized) {
      this.services.logger.warn("Shell already initialized");
      return;
    }

    this.services.logger.debug("Starting Shell initialization");
    try {
      const shellInitializer = ShellInitializer.getInstance(
        this.services.logger,
        this.config,
      );

      // Initialize databases (WAL mode, migrations, indexes, ATTACH)
      // before plugins load — they need search and embeddings to work.
      await this.services.entityService.initialize();

      await shellInitializer.initializeAll(
        this.services.templateRegistry,
        this.services.entityRegistry,
        this.services.pluginManager,
        options?.registerOnly ? { registerOnly: true } : undefined,
      );

      // Register job handlers for content operations BEFORE emitting ready event
      // This ensures handlers are registered before plugins start enqueueing jobs
      shellInitializer.registerJobHandlers(
        this.services.jobQueueService,
        this.services.contentService,
        this.services.entityService,
      );

      this.registerCoreDataSources();
      this.registerSystemCapabilities();

      this.initialized = true;

      // In registerOnly mode, stop here — no events, no background services.
      // Tools, resources, and entity types are registered and discoverable.
      if (options?.registerOnly) {
        this.services.logger.debug("Shell initialized (registerOnly mode)");
        return;
      }

      // NOTE: Identity and profile services are initialized via sync:initial:completed
      // subscription in shellInitializer. This ensures remote data is pulled by
      // git-sync before defaults are created for empty DB.

      this.services.logger.debug("Shell initialized successfully");

      // Emit system:plugins:ready BEFORE starting background services
      // This is critical: plugins must complete their ready handlers before
      // any background processing begins. For example:
      // - directory-sync needs to set up initial sync before jobs run
      // - Pending jobs from previous runs must not execute until plugins are ready
      await this.services.messageBus.send(
        "system:plugins:ready",
        {
          timestamp: new Date().toISOString(),
          pluginCount: this.services.pluginManager.getAllPluginIds().length,
        },
        "shell",
        undefined,
        undefined,
        true, // broadcast
      );
      this.services.logger.debug("Emitted system:plugins:ready event");

      // Start background services AFTER plugins:ready handlers complete
      // This ensures pending jobs from previous runs don't execute prematurely
      await this.services.jobQueueWorker.start();
      this.services.jobProgressMonitor.start();
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

    // Stop background services in reverse order of initialization
    this.services.jobProgressMonitor.stop();
    await this.services.jobQueueWorker.stop();

    for (const [pluginId] of this.services.pluginManager.getAllPlugins()) {
      await this.services.pluginManager.disablePlugin(pluginId);
    }

    // Close all database connections
    this.services.entityService.close();
    this.services.jobQueueService.close();
    this.services.conversationService.close();

    this.initialized = false;
    this.services.logger.debug("Shell shutdown complete");
  }

  public async generateContent<T = unknown>(
    config: ContentGenerationConfig,
  ): Promise<T> {
    this.requireInitialized("Shell content generation");

    const template = this.services.contentService.getTemplate(
      config.templateName,
    );
    if (!template) {
      throw new Error(`Template not found: ${config.templateName}`);
    }

    const grantedPermission = config.interfacePermissionGrant ?? "public";
    if (
      !this.services.permissionService.hasPermission(
        grantedPermission,
        template.requiredPermission,
      )
    ) {
      throw new Error(
        `Insufficient permissions: ${template.requiredPermission} required, but interface granted ${grantedPermission} for template: ${config.templateName}`,
      );
    }

    const context = {
      prompt: config.prompt,
      ...(config.conversationHistory && {
        conversationHistory: config.conversationHistory,
      }),
      ...(config.data && { data: config.data }),
    };

    return this.services.contentService.generateContent<T>(
      config.templateName,
      context,
    );
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

  public getPluginApiRoutes(): RegisteredApiRoute[] {
    const routes: RegisteredApiRoute[] = [];

    for (const [
      pluginId,
      info,
    ] of this.services.pluginManager.getAllPlugins()) {
      const { plugin } = info;
      if (
        "getApiRoutes" in plugin &&
        typeof plugin.getApiRoutes === "function"
      ) {
        for (const definition of plugin.getApiRoutes()) {
          routes.push({
            pluginId,
            fullPath: `/api/${pluginId}${definition.path}`,
            definition,
          });
        }
      }
    }

    return routes;
  }

  public registerDaemon(name: string, daemon: Daemon, pluginId: string): void {
    this.services.daemonRegistry.register(name, daemon, pluginId);
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

  public async getAppInfo(): Promise<AppInfo> {
    const interfaces = await this.services.daemonRegistry.getStatuses();

    const plugins = Array.from(
      this.services.pluginManager.getAllPlugins().values(),
    ).map((info) => ({
      id: info.plugin.id,
      type: info.plugin.type,
      version: info.plugin.version,
      status: info.status,
    }));

    const tools = this.services.mcpService.listTools().map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
    }));

    return {
      model: this.config.name || "brain-app",
      version: this.config.version || "1.0.0",
      plugins,
      interfaces,
      tools,
    };
  }

  private registerCoreDataSources(): void {
    this.services.dataSourceRegistry.register(
      new AIContentDataSource(
        this.services.aiService,
        this.services.entityService,
        this.services.templateRegistry,
        () => this.services.identityService.getCharacterContent(),
        () => this.services.profileService.getProfileContent(),
        this.config.siteBaseUrl,
      ),
    );

    this.services.dataSourceRegistry.register(
      new EntityDataSource(this.services.entityService),
    );

    this.services.logger.debug("Core DataSources registered");
  }

  private registerSystemCapabilities(): void {
    const jqs = this.services.jobQueueService;
    registerSystemCapabilities(
      {
        entityService: this.services.entityService,
        entityRegistry: this.services.entityRegistry,
        jobs: {
          ...this.jobs,
          enqueue: createEnqueueJobFn(jqs, "system", false),
          enqueueBatch: createEnqueueBatchFn(this.jobs, "system"),
          registerHandler: createRegisterHandlerFn(jqs, "system"),
        },
        conversationService: this.services.conversationService,
        messageBus: this.services.messageBus,
        logger: this.services.logger.child("system"),
        query: (prompt, context) => this.query(prompt, context),
        getIdentity: () => this.services.identityService.getCharacter(),
        getProfile: () => this.services.profileService.getProfile(),
        getAppInfo: () => this.getAppInfo(),
        searchLimit: 10,
        insights: this.insightsRegistry,
      },
      this.services.mcpService,
      this.services.messageBus,
      this.services.logger.child("system"),
    );
  }
}
