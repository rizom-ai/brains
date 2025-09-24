import type {
  ContentGenerationConfig,
  DefaultQueryResponse,
  QueryContext,
  Command,
  PluginTool,
  PluginResource,
} from "@brains/plugins";
import type { IShell } from "@brains/plugins";
import type { ServiceRegistry } from "@brains/service-registry";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import type {
  BatchJobStatus,
  Batch,
  BatchOperation,
} from "@brains/job-queue";
import type {
  JobOptions,
  JobInfo,
  IJobQueueService,
  IJobQueueWorker,
  IBatchJobManager,
} from "@brains/job-queue";
import type { MessageBus } from "@brains/messaging-service";
import type { PluginManager } from "@brains/plugins";
import type { CommandRegistry } from "@brains/command-registry";
import type { TemplateRegistry, Template } from "@brains/templates";
import { type IMCPService, type IMCPTransport } from "@brains/mcp-service";
import type { DaemonRegistry, Daemon } from "@brains/daemon-registry";
import { type IEmbeddingService } from "@brains/embedding-service";
import { type IConversationService } from "@brains/conversation-service";
import type { ContentService } from "@brains/content-service";
import { type IAIService } from "@brains/ai-service";
import type { PermissionService } from "@brains/permission-service";
import type { Logger} from "@brains/utils";
import { type IJobProgressMonitor } from "@brains/utils";
import type { Plugin } from "@brains/plugins";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";
import type { RenderService } from "@brains/render-service";
import type { DataSourceRegistry } from "@brains/datasource";

/**
 * Required dependencies for Shell initialization
 */
export interface ShellDependencies {
  logger: Logger;
  embeddingService: IEmbeddingService;
  aiService: IAIService;
  entityService: IEntityService;
  conversationService: IConversationService;
  serviceRegistry: ServiceRegistry;
  entityRegistry: IEntityRegistry;
  messageBus: MessageBus;
  renderService: RenderService;
  daemonRegistry: DaemonRegistry;
  pluginManager: PluginManager;
  commandRegistry: CommandRegistry;
  mcpService: IMCPService;
  contentService: ContentService;
  jobQueueService: IJobQueueService;
  jobQueueWorker: IJobQueueWorker;
  jobProgressMonitor: IJobProgressMonitor;
  batchJobManager: IBatchJobManager;
  permissionService: PermissionService;
  templateRegistry: TemplateRegistry;
  dataSourceRegistry: DataSourceRegistry;
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

  private readonly logger: Logger;
  private readonly serviceRegistry: ServiceRegistry;
  private readonly entityRegistry: IEntityRegistry;
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly commandRegistry: CommandRegistry;
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
  private initialized = false;

  /**
   * Get the singleton instance of Shell
   * Note: This method is deprecated. Use createFresh with dependencies instead.
   */
  public static getInstance(_config?: Partial<ShellConfig>): Shell {
    if (!Shell.instance) {
      throw new Error("Shell instance not initialized. Use createFresh with dependencies.");
    }
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
    dependencies: ShellDependencies,
    config?: Partial<ShellConfig>,
  ): Shell {
    const fullConfig = createShellConfig(config);
    return new Shell(fullConfig, dependencies);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(_config: ShellConfig, dependencies: ShellDependencies) {
    // Store service references from dependencies
    this.logger = dependencies.logger;
    this.serviceRegistry = dependencies.serviceRegistry;
    this.entityRegistry = dependencies.entityRegistry;
    this.messageBus = dependencies.messageBus;
    this.renderService = dependencies.renderService;
    this.daemonRegistry = dependencies.daemonRegistry;
    this.pluginManager = dependencies.pluginManager;
    this.commandRegistry = dependencies.commandRegistry;
    this.templateRegistry = dependencies.templateRegistry;
    this.dataSourceRegistry = dependencies.dataSourceRegistry;
    this.mcpService = dependencies.mcpService;
    this.entityService = dependencies.entityService;
    this.aiService = dependencies.aiService;
    this.conversationService = dependencies.conversationService;
    this.contentService = dependencies.contentService;
    this.jobQueueService = dependencies.jobQueueService;
    this.jobQueueWorker = dependencies.jobQueueWorker;
    this.batchJobManager = dependencies.batchJobManager;
    this.jobProgressMonitor = dependencies.jobProgressMonitor;
    this.permissionService = dependencies.permissionService;

    // Register services that plugins need to resolve
    this.serviceRegistry.register("shell", () => this);
    this.serviceRegistry.register("commandRegistry", () => this.commandRegistry);
    this.serviceRegistry.register("mcpService", () => this.mcpService);
  }

  /**
   * Initialize the Shell instance
   * Note: Heavy initialization (plugins, templates, job handlers) is now handled by ShellInitializer in the app package
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn("Shell already initialized");
      return;
    }

    try {
      // Start the job queue worker
      await this.jobQueueWorker.start();

      // Start the job progress monitor
      this.jobProgressMonitor.start();

      // Core DataSources registration is now handled externally
      this.registerCoreDataSources();

      this.initialized = true;
      this.logger.debug("Shell initialized successfully");
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

    // Build query context with sensible defaults
    const queryContext = {
      ...context,
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
  public async getActiveJobs(types?: string[]): Promise<JobInfo[]> {
    return this.jobQueueService.getActiveJobs(types);
  }

  /**
   * Get job status by ID
   */
  public async getJobStatus(jobId: string): Promise<JobInfo | null> {
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
   * Register core DataSources that are built into the shell
   * Note: DataSources are now registered by the app package during initialization
   */
  private registerCoreDataSources(): void {
    // DataSources now registered by app package
    this.logger.debug("Core DataSources registration handled by app package");
  }
}
