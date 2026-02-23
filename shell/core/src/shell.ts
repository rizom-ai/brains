import type {
  AppInfo,
  ContentGenerationConfig,
  DefaultQueryResponse,
  EvalHandler,
  IShell,
  Plugin,
  PluginResource,
  PluginTool,
  QueryContext,
  RegisteredApiRoute,
} from "@brains/plugins";
import type {
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { Daemon } from "@brains/daemon-registry";
import type { BatchJobStatus, IJobsNamespace } from "@brains/job-queue";
import type { IMCPTransport } from "@brains/mcp-service";
import type { Template } from "@brains/templates";
import { Logger, type z } from "@brains/utils";

import type { ShellConfig, ShellConfigInput } from "./config";
import { createShellConfig } from "./config";
import { SHELL_TEMPLATE_NAMES } from "./constants";
import { AIContentDataSource, EntityDataSource } from "./datasources";
import {
  ShellInitializer,
  type ShellServices,
} from "./initialization/shellInitializer";
import type { ShellDependencies } from "./types/shell-types";

export type { ShellDependencies };

export class Shell implements IShell {
  private static instance: Shell | null = null;
  private readonly services: ShellServices;
  private initialized = false;

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

    shellInitializer.wireShell(this.services, this);
  }

  public async initialize(): Promise<void> {
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

      await shellInitializer.initializeAll(
        this.services.templateRegistry,
        this.services.entityRegistry,
        this.services.pluginManager,
      );

      // Register job handlers for content operations BEFORE emitting ready event
      // This ensures handlers are registered before plugins start enqueueing jobs
      shellInitializer.registerJobHandlers(
        this.services.jobQueueService,
        this.services.contentService,
        this.services.entityService,
      );

      this.registerCoreDataSources();

      // NOTE: Identity and profile services are initialized via sync:initial:completed
      // subscription in shellInitializer. This ensures remote data is pulled by
      // git-sync before defaults are created for empty DB.

      // Mark shell as initialized BEFORE emitting ready event
      // This ensures shell methods are available to plugins:ready handlers
      this.initialized = true;
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

  public getEntityService() {
    return this.services.entityService;
  }

  public getConversationService() {
    return this.services.conversationService;
  }

  public getEntityRegistry() {
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

  public getAIService() {
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

  public getPluginManager() {
    return this.services.pluginManager;
  }

  public getContentService() {
    return this.services.contentService;
  }

  public getRenderService() {
    return this.services.renderService;
  }

  public getMessageBus() {
    return this.services.messageBus;
  }

  public getLogger() {
    return this.services.logger;
  }

  public getJobQueueService() {
    return this.services.jobQueueService;
  }

  public getMcpTransport(): IMCPTransport {
    return this.services.mcpService;
  }

  public getPermissionService() {
    return this.services.permissionService;
  }

  public getAgentService() {
    return this.services.agentService;
  }

  public registerPluginTools(pluginId: string, tools: PluginTool[]): void {
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

  public registerPluginResources(
    pluginId: string,
    resources: PluginResource[],
  ): void {
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

  public getDataSourceRegistry() {
    return this.services.dataSourceRegistry;
  }

  public getIdentity() {
    return this.services.identityService.getCharacter();
  }

  public getProfile() {
    return this.services.profileService.getProfile();
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
}
