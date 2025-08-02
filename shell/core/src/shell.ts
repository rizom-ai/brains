import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import type { ContentGenerationConfig, Daemon } from "@brains/plugins";
import type { IShell } from "@brains/plugins";
import { createDatabase } from "@brains/db";
import { ServiceRegistry } from "@brains/service-registry";
import {
  EntityRegistry,
  EntityService,
  EmbeddingJobHandler,
} from "@brains/entity-service";
import {
  JobQueueService,
  JobQueueWorker,
  BatchJobManager,
  JobProgressMonitor,
  type BatchJobStatus,
  type Batch,
  type BatchOperation,
} from "@brains/job-queue";
import type { JobOptions } from "@brains/db";
import { MessageBus } from "@brains/messaging-service";
import { PluginManager } from "@brains/plugins";
import { CommandRegistry } from "@brains/command-registry";
import { DaemonRegistry } from "@brains/daemon-registry";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "@brains/embedding-service";
import {
  createSearchCommand,
  createGetCommand,
  createGetJobStatusCommand,
} from "./commands";
import {
  ContentGenerator,
  ContentGenerationJobHandler,
  ContentDerivationJobHandler,
} from "@brains/content-generator";
import { AIService } from "@brains/ai-service";
import { Logger, LogLevel, PermissionHandler } from "@brains/utils";
import type { Plugin } from "@brains/plugins";
import type { Template } from "@brains/content-generator";
import type { RouteDefinition } from "@brains/view-registry";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";
import { ViewRegistry } from "@brains/view-registry";
import { ShellInitializer } from "./initialization/shellInitializer";
import { ShellInitializationError } from "./errors";

/**
 * Optional dependencies that can be injected for testing
 */
export interface ShellDependencies {
  db?: LibSQLDatabase<Record<string, never>>;
  dbClient?: Client;
  logger?: Logger;
  embeddingService?: IEmbeddingService;
  aiService?: AIService;
  entityService?: EntityService;
  serviceRegistry?: ServiceRegistry;
  entityRegistry?: EntityRegistry;
  messageBus?: MessageBus;
  viewRegistry?: ViewRegistry;
  daemonRegistry?: DaemonRegistry;
  pluginManager?: PluginManager;
  commandRegistry?: CommandRegistry;
  contentGenerator?: ContentGenerator;
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
  private readonly db: LibSQLDatabase<Record<string, never>>;
  private readonly dbClient: Client;
  private readonly logger: Logger;
  private readonly serviceRegistry: ServiceRegistry;
  private readonly entityRegistry: EntityRegistry;
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly commandRegistry: CommandRegistry;
  private readonly viewRegistry: ViewRegistry;
  private readonly daemonRegistry: DaemonRegistry;
  private readonly embeddingService: IEmbeddingService;
  private readonly entityService: EntityService;
  private readonly aiService: AIService;
  private readonly contentGenerator: ContentGenerator;
  private readonly jobQueueService: JobQueueService;
  private readonly jobQueueWorker: JobQueueWorker;
  private readonly batchJobManager: BatchJobManager;
  private readonly jobProgressMonitor: JobProgressMonitor;
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

    // Create fresh instances of all registries
    const logger =
      dependencies?.logger ??
      Logger.createFresh({
        level: LogLevel.INFO,
        context: fullConfig.logging.context,
      });

    const serviceRegistry = ServiceRegistry.createFresh(logger);
    const entityRegistry = EntityRegistry.createFresh(logger);
    const messageBus = MessageBus.createFresh(logger);
    const pluginManager = PluginManager.createFresh(serviceRegistry, logger);
    const commandRegistry = CommandRegistry.createFresh(logger, messageBus);

    // Merge fresh instances with any provided dependencies (without contentGenerator yet)
    const freshDependencies: ShellDependencies = {
      ...dependencies,
      logger,
      serviceRegistry,
      entityRegistry,
      messageBus,
      pluginManager,
      commandRegistry,
    };

    return new Shell(fullConfig, freshDependencies);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: ShellConfig, dependencies?: ShellDependencies) {
    this.config = config;

    // Default initialization when no dependencies are injected
    if (!dependencies) {
      // Create logger
      const logLevel = {
        debug: LogLevel.DEBUG,
        info: LogLevel.INFO,
        warn: LogLevel.WARN,
        error: LogLevel.ERROR,
      }[config.logging.level];

      this.logger = Logger.createFresh({
        level: logLevel,
        context: config.logging.context,
      });

      // Create database connection
      const { db, client } = createDatabase({
        url: config.database.url,
        authToken: config.database.authToken,
      });
      this.db = db;
      this.dbClient = client;

      // Create services
      this.embeddingService = EmbeddingService.getInstance(this.logger);
      this.aiService = AIService.getInstance(config.ai, this.logger);
    } else {
      // Use injected dependencies (for testing)
      this.logger =
        dependencies.logger ??
        Logger.createFresh({
          level: LogLevel.INFO,
          context: config.logging.context,
        });

      if (dependencies.db && dependencies.dbClient) {
        this.db = dependencies.db;
        this.dbClient = dependencies.dbClient;
      } else {
        const { db, client } = createDatabase({
          url: config.database.url,
          authToken: config.database.authToken,
        });
        this.db = db;
        this.dbClient = client;
      }

      this.embeddingService =
        dependencies.embeddingService ??
        EmbeddingService.getInstance(this.logger);
      this.aiService =
        dependencies.aiService ?? AIService.getInstance(config.ai, this.logger);
    }

    // Initialize core components
    // Use provided dependencies if available, otherwise use singletons
    this.serviceRegistry =
      dependencies?.serviceRegistry ?? ServiceRegistry.getInstance(this.logger);
    this.entityRegistry =
      dependencies?.entityRegistry ?? EntityRegistry.getInstance(this.logger);
    this.messageBus =
      dependencies?.messageBus ?? MessageBus.getInstance(this.logger);
    this.viewRegistry =
      dependencies?.viewRegistry ?? ViewRegistry.getInstance();
    this.daemonRegistry =
      dependencies?.daemonRegistry ?? DaemonRegistry.getInstance(this.logger);
    this.pluginManager =
      dependencies?.pluginManager ??
      PluginManager.getInstance(this.serviceRegistry, this.logger);
    this.commandRegistry =
      dependencies?.commandRegistry ??
      CommandRegistry.getInstance(this.logger, this.messageBus);

    // Initialize generic job queue service and worker
    this.jobQueueService =
      dependencies?.jobQueueService ??
      JobQueueService.createFresh(this.db, this.logger);

    // Register embedding job handler
    const embeddingJobHandler = EmbeddingJobHandler.createFresh(
      this.db,
      this.embeddingService,
    );
    this.jobQueueService.registerHandler("embedding", embeddingJobHandler);

    // Initialize EntityService with the configured JobQueueService
    this.entityService =
      dependencies?.entityService ??
      EntityService.getInstance({
        db: this.db,
        embeddingService: this.embeddingService,
        entityRegistry: this.entityRegistry,
        logger: this.logger,
        jobQueueService: this.jobQueueService,
      });

    this.contentGenerator =
      dependencies?.contentGenerator ??
      new ContentGenerator({
        logger: this.logger,
        entityService: this.entityService,
        aiService: this.aiService,
      });

    // Register content generation job handler
    const contentGenerationJobHandler = ContentGenerationJobHandler.createFresh(
      this.contentGenerator,
      this.entityService,
    );
    this.jobQueueService.registerHandler(
      "content-generation",
      contentGenerationJobHandler,
    );

    // Register content derivation job handler
    const contentDerivationJobHandler = ContentDerivationJobHandler.createFresh(
      this.entityService,
    );
    this.jobQueueService.registerHandler(
      "content-derivation",
      contentDerivationJobHandler,
    );

    // Register core components in the service registry
    this.serviceRegistry.register("shell", () => this);
    this.serviceRegistry.register("entityRegistry", () => this.entityRegistry);
    this.serviceRegistry.register("messageBus", () => this.messageBus);
    this.serviceRegistry.register("pluginManager", () => this.pluginManager);
    this.serviceRegistry.register("entityService", () => this.entityService);
    this.serviceRegistry.register("aiService", () => this.aiService);
    this.serviceRegistry.register(
      "contentGenerator",
      () => this.contentGenerator,
    );
    this.serviceRegistry.register("viewRegistry", () => this.viewRegistry);
    this.serviceRegistry.register("daemonRegistry", () => this.daemonRegistry);
    this.serviceRegistry.register(
      "jobQueueService",
      () => this.jobQueueService,
    );
    // Initialize BatchJobManager
    this.batchJobManager = BatchJobManager.getInstance(
      this.jobQueueService,
      this.logger,
    );
    this.serviceRegistry.register(
      "batchJobManager",
      () => this.batchJobManager,
    );

    this.jobProgressMonitor =
      dependencies?.jobProgressMonitor ??
      JobProgressMonitor.getInstance(
        this.jobQueueService,
        this.batchJobManager,
        this.messageBus,
        this.logger,
      );
    this.serviceRegistry.register(
      "jobProgressMonitor",
      () => this.jobProgressMonitor,
    );

    // Initialize JobQueueWorker after JobProgressMonitor
    this.jobQueueWorker =
      dependencies?.jobQueueWorker ??
      JobQueueWorker.createFresh(
        this.jobQueueService,
        this.jobProgressMonitor,
        this.logger,
        {
          pollInterval: 100, // 100ms for responsive processing
          concurrency: 1, // Process one job at a time
          autoStart: false, // Start manually during initialization
        },
      );
    this.serviceRegistry.register("jobQueueWorker", () => this.jobQueueWorker);
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
        this.dbClient,
      );

      await shellInitializer.initializeAll(
        this.contentGenerator,
        this.entityRegistry,
        this.pluginManager,
      );

      // Start the job queue worker
      await this.jobQueueWorker.start();
      this.logger.info("Job queue worker started");

      // Start the job progress monitor
      this.jobProgressMonitor.start();
      this.logger.info("Job progress monitor started");

      // Register shell commands
      this.registerShellCommands();
      this.logger.info("Shell commands registered");

      this.initialized = true;
      this.logger.info("Shell initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Shell", error);
      throw error;
    }
  }

  /**
   * Register shell commands with the command registry
   */
  private registerShellCommands(): void {
    this.logger.debug("Registering shell commands");

    // Register each shell command
    const commands = [
      createSearchCommand(this),
      createGetCommand(this),
      createGetJobStatusCommand(this),
    ];

    commands.forEach((command) => {
      this.commandRegistry.registerCommand("shell", command);
      this.logger.debug(`Registered shell command: ${command.name}`);
    });

    this.logger.info(`Registered ${commands.length} shell commands`);
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
   * Register a unified template for both content generation and view rendering
   */
  public registerTemplate<T>(
    name: string,
    template: Template<T>,
    pluginId?: string,
  ): void {
    // Apply scoping: shell templates get "shell:" prefix, plugins get "pluginId:" prefix
    const scopedName = pluginId ? `${pluginId}:${name}` : `shell:${name}`;

    this.logger.debug("Registering unified template", {
      originalName: name,
      scopedName,
      pluginId: pluginId ?? "shell",
    });

    // Register with ContentGenerator for content generation
    this.contentGenerator.registerTemplate(scopedName, template);

    // Register with ViewRegistry for rendering if layout is provided
    if (template.layout?.component) {
      this.viewRegistry.registerTemplate(scopedName, template);
    }

    this.logger.debug(`Registered unified template: ${scopedName}`);
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

      this.viewRegistry.registerRoute(processedRoute);
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

    // Close database connection
    this.dbClient.close();

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
      throw new ShellInitializationError(
        "Shell query attempted before initialization",
        { operation: "query" },
      );
    }

    // Validate template exists
    const template = this.contentGenerator.getTemplate(config.templateName);
    if (!template) {
      throw new Error(`Template not found: ${config.templateName}`);
    }

    // Check if interface-granted permission meets template requirements
    const grantedPermission = config.interfacePermissionGrant ?? "public";
    if (
      !PermissionHandler.canUseTemplate(
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
      ...(config.data && { data: config.data }),
    };

    return this.contentGenerator.generateContent<T>(
      config.templateName,
      context,
    );
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: Plugin): void {
    if (!this.initialized) {
      throw new ShellInitializationError(
        "Plugin registration attempted before initialization",
        { operation: "registerPlugin", pluginId: plugin.id },
      );
    }

    this.pluginManager.registerPlugin(plugin);
  }

  /**
   * Check if Shell is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  // Minimal getters needed for MCP integration

  public getEntityService(): EntityService {
    return this.entityService;
  }

  public getEntityRegistry(): EntityRegistry {
    return this.entityRegistry;
  }

  public getAIService(): AIService {
    return this.aiService;
  }

  public getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  public getContentGenerator(): ContentGenerator {
    return this.contentGenerator;
  }

  public getViewRegistry(): ViewRegistry {
    return this.viewRegistry;
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

  public getServiceRegistry(): ServiceRegistry {
    return this.serviceRegistry;
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
    pluginId: string,
  ): Promise<string> {
    return this.batchJobManager.enqueueBatch(operations, options, pluginId);
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
}
