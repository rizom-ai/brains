import type {
  ContentGenerationConfig,
  Daemon,
  DefaultQueryResponse,
  QueryContext,
  Command,
  PluginTool,
  PluginResource,
} from "@brains/plugins";
import type { IShell } from "@brains/plugins";
import type { ServiceRegistry } from "@brains/service-registry";
import type { EntityRegistry, EntityService } from "@brains/entity-service";
import {
  JobProgressMonitor,
  type BatchJobStatus,
  type Batch,
  type BatchOperation,
} from "@brains/job-queue";
import type {
  JobOptions,
  JobQueue,
  JobQueueService,
  JobQueueWorker,
  BatchJobManager,
} from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import type { PluginManager } from "@brains/plugins";
import type { CommandRegistry } from "@brains/command-registry";
import { TemplateRegistry, type Template } from "@brains/templates";
import { type IMCPService, type IMCPTransport } from "@brains/mcp-service";
import type { DaemonRegistry } from "@brains/daemon-registry";
import { type IEmbeddingService } from "@brains/embedding-service";
import { type IConversationService } from "@brains/conversation-service";
import type { ContentService } from "@brains/content-service";
import { type IAIService } from "@brains/ai-service";
import { PermissionService } from "@brains/permission-service";
import { Logger } from "@brains/utils";
import type { Plugin } from "@brains/plugins";
import type { RouteDefinition } from "@brains/render-service";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";
import type { RenderService, RouteRegistry } from "@brains/render-service";
import { ShellInitializer } from "./initialization/shellInitializer";
import type { DataSourceRegistry } from "@brains/datasource";
import { SystemStatsDataSource, AIContentDataSource } from "./datasources";

/**
 * Optional dependencies that can be injected for testing
 */
export interface ShellDependencies {
  logger?: Logger;
  embeddingService?: IEmbeddingService;
  aiService?: IAIService;
  entityService?: EntityService;
  conversationService?: IConversationService;
  serviceRegistry?: ServiceRegistry;
  entityRegistry?: EntityRegistry;
  messageBus?: MessageBus;
  renderService?: RenderService;
  routeRegistry?: RouteRegistry;
  daemonRegistry?: DaemonRegistry;
  pluginManager?: PluginManager;
  commandRegistry?: CommandRegistry;
  mcpService?: IMCPService;
  contentService?: ContentService;
  jobQueueService?: JobQueueService;
  jobQueueWorker?: JobQueueWorker;
  jobProgressMonitor?: JobProgressMonitor;
}

/**
 * Shell - The main entry point for the Brain system
 *
 * This class encapsulates all core functionality and provides
 * a unified interface for interacting with the Brain.
 * Follows Component Interface Standardization pattern.
 */
export class Shell implements IShell {
  private static instance: Shell | null = null;

  private readonly config: ShellConfig;
  private readonly logger: Logger;
  private readonly serviceRegistry: ServiceRegistry;
  private readonly entityRegistry: EntityRegistry;
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly commandRegistry: CommandRegistry;
  private readonly mcpService: IMCPService;
  private readonly renderService: RenderService;
  private readonly routeRegistry: RouteRegistry;
  private readonly daemonRegistry: DaemonRegistry;
  private readonly entityService: EntityService;
  private readonly aiService: IAIService;
  private readonly conversationService: IConversationService;
  private readonly contentService: ContentService;
  private readonly jobQueueService: JobQueueService;
  private readonly jobQueueWorker: JobQueueWorker;
  private readonly batchJobManager: BatchJobManager;
  private readonly jobProgressMonitor: JobProgressMonitor;
  private readonly permissionService: PermissionService;
  private readonly templateRegistry: TemplateRegistry;
  private readonly dataSourceRegistry: DataSourceRegistry;
  private initialized = false;

  /**
   * Get the singleton instance of Shell
   */
  public static getInstance(config?: Partial<ShellConfig>): Shell {
    Shell.instance ??= new Shell(createShellConfig(config));
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
    // Also reset dependent singletons
    ShellInitializer.resetInstance();
    JobProgressMonitor.resetInstance();
    TemplateRegistry.resetInstance();
  }

  /**
   * Create a fresh instance without affecting the singleton
   * @param config - Configuration for the shell
   * @param dependencies - Optional dependencies for testing
   */
  public static createFresh(
    config?: Partial<ShellConfig>,
    dependencies?: ShellDependencies,
  ): Shell {
    const fullConfig = createShellConfig(config);
    return new Shell(fullConfig, dependencies);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: ShellConfig, dependencies?: ShellDependencies) {
    this.config = config;

    // Use ShellInitializer to create all services
    const shellInitializer = ShellInitializer.getInstance(
      Logger.getInstance(),
      config,
    );

    const services = shellInitializer.initializeServices(dependencies);

    // Store service references
    this.logger = services.logger;
    this.serviceRegistry = services.serviceRegistry;
    this.entityRegistry = services.entityRegistry;
    this.messageBus = services.messageBus;
    this.renderService = services.renderService;
    this.routeRegistry = services.routeRegistry;
    this.daemonRegistry = services.daemonRegistry;
    this.pluginManager = services.pluginManager;
    this.commandRegistry = services.commandRegistry;
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

    // Register only the services that plugins actually need
    shellInitializer.registerServices(services, this);
  }

  /**
   * Initialize the Shell and all its components
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn("Shell already initialized");
      return;
    }

    this.logger.info("Initializing Shell");

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

      // Start the job queue worker
      await this.jobQueueWorker.start();
      this.logger.info("Job queue worker started");

      // Start the job progress monitor
      this.jobProgressMonitor.start();
      this.logger.info("Job progress monitor started");

      // Register core DataSources
      this.registerCoreDataSources();

      // Shell commands now provided by system plugin

      this.initialized = true;
      this.logger.info("Shell initialized successfully");
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
   * Register routes (typically called by plugins)
   */
  public registerRoutes(
    routes: RouteDefinition[],
    options?: {
      pluginId?: string;
      environment?: string;
    },
  ): void {
    const { pluginId } = options ?? {};
    this.logger.debug("Registering routes", { pluginId, count: routes.length });

    routes.forEach((route) => {
      const processedRoute = {
        ...route,
        pluginId,
        sections: route.sections.map((section) => ({
          ...section,
          // Add scoping prefix to template name: shell templates get "shell:" prefix, plugins get "pluginId:" prefix
          template:
            section.template && `${pluginId ?? "shell"}:${section.template}`,
        })),
      };

      this.routeRegistry.register(processedRoute);
    });

    this.logger.debug(`Registered ${routes.length} routes`, { pluginId });
  }

  /**
   * Shutdown the Shell and clean up resources
   */
  public async shutdown(): Promise<void> {
    this.logger.info("Shutting down Shell");

    // Cleanup in reverse order of initialization
    // Stop the job progress monitor first
    this.jobProgressMonitor.stop();
    this.logger.info("Job progress monitor stopped");

    // Stop the job queue worker
    await this.jobQueueWorker.stop();
    this.logger.info("Job queue worker stopped");

    // Disable all plugins
    for (const [pluginId] of this.pluginManager.getAllPlugins()) {
      await this.pluginManager.disablePlugin(pluginId);
    }

    // Clear registries
    this.serviceRegistry.clear();

    this.initialized = false;
    this.logger.info("Shell shutdown complete");
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
      !PermissionService.hasPermission(
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
      ...(config.conversationId && { conversationId: config.conversationId }),
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

    // Build query context with sensible defaults
    const queryContext = {
      ...context,
      timestamp: new Date().toISOString(),
    };

    // Use the knowledge-query template for AI-powered responses
    return this.generateContent<DefaultQueryResponse>({
      prompt,
      templateName: "shell:knowledge-query",
      conversationId: context?.conversationId || "default",
      data: queryContext,
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

  public getEntityService(): EntityService {
    return this.entityService;
  }

  public getConversationService(): IConversationService {
    return this.conversationService;
  }

  public getEntityRegistry(): EntityRegistry {
    return this.entityRegistry;
  }

  public getAIService(): IAIService {
    return this.aiService;
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

  public getRouteRegistry(): RouteRegistry {
    return this.routeRegistry;
  }

  public getMessageBus(): MessageBus {
    return this.messageBus;
  }

  public getLogger(): Logger {
    return this.logger;
  }

  public getJobQueueService(): JobQueueService {
    return this.jobQueueService;
  }

  public getCommandRegistry(): CommandRegistry {
    return this.commandRegistry;
  }

  public getMcpTransport(): IMCPTransport {
    return this.mcpService;
  }

  public getPermissionService(): PermissionService {
    return this.permissionService;
  }

  /**
   * Register plugin commands
   */
  public registerPluginCommands(pluginId: string, commands: Command[]): void {
    for (const command of commands) {
      try {
        this.commandRegistry.registerCommand(pluginId, command);
      } catch (error) {
        this.logger.error(
          `Failed to register command ${command.name} from ${pluginId}:`,
          error,
        );
      }
    }
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
   * Enqueue a batch of operations
   */
  public async enqueueBatch(
    operations: BatchOperation[],
    options: JobOptions,
    batchId: string,
    pluginId: string,
  ): Promise<string> {
    return this.batchJobManager.enqueueBatch(
      operations,
      options,
      batchId,
      pluginId,
    );
  }

  /**
   * Get active batches
   */
  public async getActiveBatches(): Promise<Batch[]> {
    return this.batchJobManager.getActiveBatches();
  }

  /**
   * Get batch status by ID
   */
  public async getBatchStatus(batchId: string): Promise<BatchJobStatus | null> {
    return this.batchJobManager.getBatchStatus(batchId);
  }

  /**
   * Get active jobs
   */
  public async getActiveJobs(types?: string[]): Promise<JobQueue[]> {
    return this.jobQueueService.getActiveJobs(types);
  }

  /**
   * Get job status by ID
   */
  public async getJobStatus(jobId: string): Promise<JobQueue | null> {
    return this.jobQueueService.getStatus(jobId);
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
    entityService: EntityService;
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
   * Register core DataSources that are built into the shell
   */
  private registerCoreDataSources(): void {
    this.logger.debug("Registering core DataSources");

    // Register the SystemStats DataSource
    const systemStatsDataSource = new SystemStatsDataSource(this.entityService);
    this.dataSourceRegistry.register(systemStatsDataSource);

    // Register the AI Content DataSource
    const aiContentDataSource = new AIContentDataSource(
      this.aiService,
      this.conversationService,
      this.entityService,
      this.templateRegistry,
      this.logger,
    );
    this.dataSourceRegistry.register(aiContentDataSource);

    this.logger.debug("Core DataSources registered");
  }
}
