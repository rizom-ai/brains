import type {
  ContentGenerationConfig,
  DefaultQueryResponse,
  QueryContext,
  PluginTool,
  PluginResource,
  AppInfo,
  EvalHandler,
} from "@brains/plugins";
import type { IShell } from "@brains/plugins";
import type { ServiceRegistry } from "@brains/service-registry";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import type {
  BatchJobStatus,
  Batch,
  BatchOperation,
  JobOptions,
  JobInfo,
  IJobQueueService,
  IJobQueueWorker,
  IBatchJobManager,
  IJobsNamespace,
} from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import type { PluginManager } from "@brains/plugins";
import type { TemplateRegistry, Template } from "@brains/templates";
import { type IMCPService, type IMCPTransport } from "@brains/mcp-service";
import type { DaemonRegistry, Daemon } from "@brains/daemon-registry";
import { type IConversationService } from "@brains/conversation-service";
import type { ContentService } from "@brains/content-service";
import type {
  IAIService,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/ai-service";
import type { PermissionService } from "@brains/permission-service";
import { Logger } from "@brains/utils";
import { type IJobProgressMonitor } from "@brains/utils";
import type { Plugin } from "@brains/plugins";
import type { ShellConfig, ShellConfigInput } from "./config";
import { createShellConfig } from "./config";
import type { RenderService } from "@brains/render-service";
import type { DataSourceRegistry } from "@brains/datasource";
import { ShellInitializer } from "./initialization/shellInitializer";
import {
  SystemStatsDataSource,
  AIContentDataSource,
  EntityDataSource,
} from "./datasources";
import type { IdentityService } from "@brains/identity-service";
import type { IdentityBody } from "@brains/identity-service";
import type { ProfileService, ProfileBody } from "@brains/profile-service";
import type { IAgentService } from "@brains/agent-service";
import type { ShellDependencies } from "./types/shell-types";

export type { ShellDependencies };

/**
 * Shell - The main entry point for the Brain system
 *
 * This class encapsulates all core functionality and provides
 * a unified interface for interacting with the Brain.
 * Follows Component Interface Standardization pattern.
 */
export class Shell implements IShell {
  private static instance: Shell | null = null;

  private readonly logger: Logger;
  private readonly serviceRegistry: ServiceRegistry;
  private readonly entityRegistry: IEntityRegistry;
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly mcpService: IMCPService;
  private readonly renderService: RenderService;
  private readonly daemonRegistry: DaemonRegistry;
  private readonly entityService: IEntityService;
  private readonly aiService: IAIService;
  private readonly conversationService: IConversationService;
  private readonly contentService: ContentService;
  private readonly jobQueueService: IJobQueueService;
  private readonly jobQueueWorker: IJobQueueWorker;
  private readonly batchJobManager: IBatchJobManager;
  private readonly jobProgressMonitor: IJobProgressMonitor;
  private readonly permissionService: PermissionService;
  private readonly templateRegistry: TemplateRegistry;
  private readonly dataSourceRegistry: DataSourceRegistry;
  private readonly identityService: IdentityService;
  private readonly profileService: ProfileService;
  private readonly agentService: IAgentService;
  private initialized = false;

  /** Jobs namespace - unified access to job queue and batch operations */
  public readonly jobs: IJobsNamespace;

  /**
   * Get the singleton instance of Shell
   */
  public static getInstance(config?: Partial<ShellConfig>): Shell {
    Shell.instance ??= new Shell(createShellConfig(config ?? {}));
    return Shell.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static async resetInstance(): Promise<void> {
    if (Shell.instance) {
      await Shell.instance.shutdown();
      Shell.instance = null;
    }
    // Also reset dependent singletons - handled by app package now
  }

  /**
   * Create a fresh instance without affecting the singleton
   * @param config - Configuration for the shell
   * @param dependencies - Optional dependencies for testing
   */
  public static createFresh(
    config?: ShellConfigInput,
    dependencies?: ShellDependencies,
  ): Shell {
    const fullConfig = createShellConfig(config);
    return new Shell(fullConfig, dependencies);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private config: ShellConfig,
    dependencies?: ShellDependencies,
  ) {
    // Initialize services using ShellInitializer
    const shellInitializer = ShellInitializer.getInstance(
      dependencies?.logger ?? Logger.getInstance(),
      this.config,
    );

    const services = shellInitializer.initializeServices(dependencies);

    // Store service references
    this.logger = services.logger;
    this.serviceRegistry = services.serviceRegistry;
    this.entityRegistry = services.entityRegistry;
    this.messageBus = services.messageBus;
    this.renderService = services.renderService;
    this.daemonRegistry = services.daemonRegistry;
    this.pluginManager = services.pluginManager;
    this.templateRegistry = services.templateRegistry;
    this.dataSourceRegistry = services.dataSourceRegistry;
    this.mcpService = services.mcpService;
    this.entityService = services.entityService;
    this.aiService = services.aiService;
    this.conversationService = services.conversationService;
    this.contentService = services.contentService;
    this.jobQueueService = services.jobQueueService;
    this.jobQueueWorker = services.jobQueueWorker;
    this.batchJobManager = services.batchJobManager;
    this.jobProgressMonitor = services.jobProgressMonitor;
    this.permissionService = services.permissionService;
    this.identityService = services.identityService;
    this.profileService = services.profileService;
    this.agentService = services.agentService;

    // Initialize jobs namespace
    this.jobs = {
      enqueueBatch: (
        operations: BatchOperation[],
        options: JobOptions,
        batchId: string,
        pluginId: string,
      ): Promise<string> =>
        this.batchJobManager.enqueueBatch(
          operations,
          options,
          batchId,
          pluginId,
        ),
      getActiveBatches: (): Promise<Batch[]> =>
        this.batchJobManager.getActiveBatches(),
      getBatchStatus: (batchId: string): Promise<BatchJobStatus | null> =>
        this.batchJobManager.getBatchStatus(batchId),
      getActiveJobs: (types?: string[]): Promise<JobInfo[]> =>
        this.jobQueueService.getActiveJobs(types),
      getStatus: (jobId: string): Promise<JobInfo | null> =>
        this.jobQueueService.getStatus(jobId),
    };

    // Register services that plugins need to resolve
    shellInitializer.registerServices(services, this);
  }

  /**
   * Initialize the Shell instance
   */
  public async initialize(): Promise<void> {
    this.logger.debug("Shell.initialize() called");
    if (this.initialized) {
      this.logger.warn("Shell already initialized");
      return;
    }

    this.logger.debug("Starting Shell initialization");
    try {
      const shellInitializer = ShellInitializer.getInstance(
        this.logger,
        this.config,
      );

      await shellInitializer.initializeAll(
        this.templateRegistry,
        this.entityRegistry,
        this.pluginManager,
      );

      // Register job handlers for content operations BEFORE emitting ready event
      // This ensures handlers are registered before plugins start enqueueing jobs
      shellInitializer.registerJobHandlers(
        this.jobQueueService,
        this.contentService,
        this.entityService,
      );

      // Core DataSources registration
      this.registerCoreDataSources();

      // NOTE: Identity and profile services are initialized via sync:initial:completed
      // subscription in shellInitializer. This ensures remote data is pulled by
      // git-sync before defaults are created for empty DB.

      // Mark shell as initialized BEFORE emitting ready event
      // This ensures shell methods are available to plugins:ready handlers
      this.initialized = true;
      this.logger.debug("Shell initialized successfully");

      // Emit system:plugins:ready BEFORE starting background services
      // This is critical: plugins must complete their ready handlers before
      // any background processing begins. For example:
      // - directory-sync needs to set up initial sync before jobs run
      // - Pending jobs from previous runs must not execute until plugins are ready
      await this.messageBus.send(
        "system:plugins:ready",
        {
          timestamp: new Date().toISOString(),
          pluginCount: this.pluginManager.getAllPluginIds().length,
        },
        "shell",
        undefined,
        undefined,
        true, // broadcast
      );
      this.logger.debug("Emitted system:plugins:ready event");

      // Start background services AFTER plugins:ready handlers complete
      // This ensures pending jobs from previous runs don't execute prematurely
      await this.jobQueueWorker.start();
      this.jobProgressMonitor.start();
    } catch (error) {
      this.logger.error("Failed to initialize Shell", error);
      throw error;
    }
  }

  /**
   * Register multiple templates at once
   */
  public registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void {
    this.logger.debug("Registering templates", {
      pluginId,
      count: Object.keys(templates).length,
    });

    Object.entries(templates).forEach(([name, template]) => {
      this.registerTemplate(name, template, pluginId);
    });
  }

  /**
   * Shutdown the Shell and clean up resources
   */
  public async shutdown(): Promise<void> {
    this.logger.debug("Shutting down Shell");

    // Cleanup in reverse order of initialization
    // Stop the job progress monitor first
    this.jobProgressMonitor.stop();
    this.logger.debug("Job progress monitor stopped");

    // Stop the job queue worker
    await this.jobQueueWorker.stop();
    this.logger.debug("Job queue worker stopped");

    // Disable all plugins
    for (const [pluginId] of this.pluginManager.getAllPlugins()) {
      await this.pluginManager.disablePlugin(pluginId);
    }

    // Clear registries
    this.serviceRegistry.clear();

    this.initialized = false;
    this.logger.debug("Shell shutdown complete");
  }

  /**
   * Generate content using a template with permission checking
   */
  public async generateContent<T = unknown>(
    config: ContentGenerationConfig,
  ): Promise<T> {
    if (!this.initialized) {
      throw new Error("Shell query attempted before initialization");
    }

    // Validate template exists
    const template = this.contentService.getTemplate(config.templateName);
    if (!template) {
      throw new Error(`Template not found: ${config.templateName}`);
    }

    // Check if interface-granted permission meets template requirements
    const grantedPermission = config.interfacePermissionGrant ?? "public";
    if (
      !this.permissionService.hasPermission(
        grantedPermission,
        template.requiredPermission,
      )
    ) {
      throw new Error(
        `Insufficient permissions: ${template.requiredPermission} required, but interface granted ${grantedPermission} for template: ${config.templateName}`,
      );
    }

    // Generate content
    const context = {
      prompt: config.prompt,
      ...(config.conversationHistory && {
        conversationHistory: config.conversationHistory,
      }),
      ...(config.data && { data: config.data }),
    };

    return this.contentService.generateContent<T>(config.templateName, context);
  }

  /**
   * Query the knowledge base with AI-powered search
   * This is a core shell operation that uses the knowledge-query template
   */
  public async query(
    prompt: string,
    context?: QueryContext,
  ): Promise<DefaultQueryResponse> {
    if (!this.initialized) {
      throw new Error("Shell query attempted before initialization");
    }

    // Fetch app info to provide daemon URLs and infrastructure context
    const appInfo = await this.getAppInfo();

    // Build query context with sensible defaults
    const queryContext = {
      ...context,
      appInfo,
      timestamp: new Date().toISOString(),
    };

    // Extract conversationHistory to pass at top level
    const { conversationHistory, ...contextData } = queryContext;

    // Use the knowledge-query template for AI-powered responses
    return this.generateContent<DefaultQueryResponse>({
      prompt,
      templateName: "shell:knowledge-query",
      ...(conversationHistory && { conversationHistory }),
      data: contextData,
      interfacePermissionGrant: "public", // Default to public, callers can override via context
    });
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: Plugin): void {
    if (!this.initialized) {
      throw new Error("Plugin registration attempted before initialization");
    }

    this.pluginManager.registerPlugin(plugin);
  }

  /**
   * Check if Shell is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  // Keep only getters that are actually used by plugins and tests

  public getEntityService(): IEntityService {
    return this.entityService;
  }

  public getConversationService(): IConversationService {
    return this.conversationService;
  }

  public getEntityRegistry(): IEntityRegistry {
    return this.entityRegistry;
  }

  public getAIService(): IAIService {
    return this.aiService;
  }

  public generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    return this.aiService.generateImage(prompt, options);
  }

  public canGenerateImages(): boolean {
    return this.aiService.canGenerateImages();
  }

  public getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  public getContentService(): ContentService {
    return this.contentService;
  }

  public getRenderService(): RenderService {
    return this.renderService;
  }

  public getMessageBus(): MessageBus {
    return this.messageBus;
  }

  public getLogger(): Logger {
    return this.logger;
  }

  public getJobQueueService(): IJobQueueService {
    return this.jobQueueService;
  }

  public getMcpTransport(): IMCPTransport {
    return this.mcpService;
  }

  public getPermissionService(): PermissionService {
    return this.permissionService;
  }

  public getAgentService(): IAgentService {
    return this.agentService;
  }

  /**
   * Register plugin tools
   */
  public registerPluginTools(pluginId: string, tools: PluginTool[]): void {
    for (const tool of tools) {
      try {
        this.mcpService.registerTool(pluginId, tool);
      } catch (error) {
        this.logger.error(
          `Failed to register tool ${tool.name} from ${pluginId}:`,
          error,
        );
      }
    }
  }

  /**
   * Register plugin resources
   */
  public registerPluginResources(
    pluginId: string,
    resources: PluginResource[],
  ): void {
    for (const resource of resources) {
      try {
        this.mcpService.registerResource(pluginId, resource);
      } catch (error) {
        this.logger.error(
          `Failed to register resource ${resource.name} from ${pluginId}:`,
          error,
        );
      }
    }
  }

  /**
   * Get plugin package name by ID
   */
  public getPluginPackageName(pluginId: string): string | undefined {
    return this.pluginManager.getPluginPackageName(pluginId);
  }

  /**
   * Register a daemon
   */
  public registerDaemon(name: string, daemon: Daemon, pluginId: string): void {
    this.daemonRegistry.register(name, daemon, pluginId);
  }

  /**
   * Get a public context for shell tools
   * This provides access to shell services with public permissions
   */
  public getPublicContext(): {
    entityService: IEntityService;
    generateContent: <T = unknown>(
      config: ContentGenerationConfig,
    ) => Promise<T>;
    getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
  } {
    return {
      entityService: this.entityService,
      generateContent: <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => this.generateContent<T>(config),
      getBatchStatus: async (
        batchId: string,
      ): Promise<BatchJobStatus | null> => {
        return this.batchJobManager.getBatchStatus(batchId);
      },
    };
  }

  // =====================================
  // Template Registry Methods
  // =====================================

  /**
   * Register a template in the central registry
   */
  public registerTemplate(
    name: string,
    template: Template,
    pluginId?: string,
  ): void {
    const scopedName = pluginId ? `${pluginId}:${name}` : `shell:${name}`;

    // Store in central registry
    this.templateRegistry.register(scopedName, template);

    // RenderService automatically queries central TemplateRegistry for templates with layout.component

    this.logger.debug(`Registered template: ${scopedName}`);
  }

  /**
   * Get a template by name from the central registry
   */
  public getTemplate(name: string): Template | undefined {
    return this.templateRegistry.get(name);
  }

  /**
   * Get the DataSource registry
   */
  public getDataSourceRegistry(): DataSourceRegistry {
    return this.dataSourceRegistry;
  }

  /**
   * Get the brain's identity
   */
  public getIdentity(): IdentityBody {
    return this.identityService.getIdentity();
  }

  /**
   * Get the brain's profile
   */
  public getProfile(): ProfileBody {
    return this.profileService.getProfile();
  }

  /**
   * Get the data directory where plugins should store entity files
   */
  public getDataDir(): string {
    return this.config.dataDir;
  }

  /**
   * Register an eval handler for plugin testing
   * Delegates to the injected eval handler registry if available
   */
  public registerEvalHandler(
    pluginId: string,
    handlerId: string,
    handler: EvalHandler,
  ): void {
    if (this.config.evalHandlerRegistry) {
      this.config.evalHandlerRegistry.register(pluginId, handlerId, handler);
    }
    // If no registry is injected, silently ignore - evals aren't being run
  }

  /**
   * Get app metadata including plugin and interface statuses
   */
  public async getAppInfo(): Promise<AppInfo> {
    const interfaces = await this.daemonRegistry.getStatuses();

    // Get plugin information
    const plugins = Array.from(this.pluginManager.getAllPlugins().values()).map(
      (info) => ({
        id: info.plugin.id,
        type: info.plugin.type,
        version: info.plugin.version,
        status: info.status,
      }),
    );

    // Get tool information
    const tools = this.mcpService.listTools().map(({ tool }) => ({
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

  /**
   * Register core DataSources that are built into the shell
   */
  private registerCoreDataSources(): void {
    this.logger.debug("Registering core DataSources");

    // Register the SystemStats DataSource
    const systemStatsDataSource = new SystemStatsDataSource(this.entityService);
    this.dataSourceRegistry.register(systemStatsDataSource);
    this.logger.debug("Registered SystemStats DataSource");

    // Register the AI Content DataSource with identity and profile content
    const aiContentDataSource = new AIContentDataSource(
      this.aiService,
      this.entityService,
      this.templateRegistry,
      () => this.identityService.getIdentityContent(),
      () => this.profileService.getProfileContent(),
      this.config.siteBaseUrl,
    );
    this.dataSourceRegistry.register(aiContentDataSource);
    this.logger.debug("Registered AI Content DataSource");

    // Register the Entity DataSource for fetching entity content
    const entityDataSource = new EntityDataSource(this.entityService);
    this.dataSourceRegistry.register(entityDataSource);
    this.logger.debug("Registered Entity DataSource");

    this.logger.debug("Core DataSources registered");
  }
}
