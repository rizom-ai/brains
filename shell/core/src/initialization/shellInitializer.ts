import { Logger, LogLevel } from "@brains/utils";
import type { ShellConfig } from "../config";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import type { ContentService } from "@brains/content-service";
import {
  ContentGenerationJobHandler,
  ContentDerivationJobHandler,
} from "@brains/content-service";
import { PluginManager } from "@brains/plugins";
import { ServiceRegistry } from "@brains/service-registry";
import { MessageBus } from "@brains/messaging-service";
import { CommandRegistry } from "@brains/command-registry";
import { MCPService, type IMCPService } from "@brains/mcp-service";
import { DaemonRegistry } from "@brains/daemon-registry";
import { RenderService } from "@brains/render-service";
import { TemplateRegistry } from "@brains/templates";
import { DataSourceRegistry } from "@brains/datasource";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "@brains/embedding-service";
import {
  ConversationService,
  type IConversationService,
} from "@brains/conversation-service";
import { ContentService as ContentServiceClass } from "@brains/content-service";
import { AIService, type IAIService } from "@brains/ai-service";
import { PermissionService } from "@brains/permission-service";
import {
  JobQueueService,
  JobQueueWorker,
  BatchJobManager,
  JobProgressMonitor,
  type JobQueueDbConfig,
} from "@brains/job-queue";
import { BaseEntityAdapter } from "../entities/base-entity-adapter";
import { knowledgeQueryTemplate } from "../templates";
import { BaseEntityFormatter, baseEntitySchema } from "@brains/entity-service";
import type { ShellDependencies } from "../shell";

/**
 * Services initialized by ShellInitializer
 */
export interface ShellServices {
  logger: Logger;
  serviceRegistry: ServiceRegistry;
  entityRegistry: EntityRegistry;
  messageBus: MessageBus;
  renderService: RenderService;
  daemonRegistry: DaemonRegistry;
  pluginManager: PluginManager;
  commandRegistry: CommandRegistry;
  templateRegistry: TemplateRegistry;
  dataSourceRegistry: DataSourceRegistry;
  mcpService: IMCPService;
  embeddingService: IEmbeddingService;
  entityService: EntityService;
  aiService: IAIService;
  conversationService: IConversationService;
  contentService: ContentService;
  jobQueueService: JobQueueService;
  jobQueueWorker: JobQueueWorker;
  batchJobManager: BatchJobManager;
  jobProgressMonitor: JobProgressMonitor;
  permissionService: PermissionService;
}

/**
 * Handles Shell initialization logic
 * Extracted from Shell to improve maintainability
 */
export class ShellInitializer {
  private static instance: ShellInitializer | null = null;

  private logger: Logger;
  private config: ShellConfig;

  /**
   * Get the singleton instance of ShellInitializer
   */
  public static getInstance(
    logger: Logger,
    config: ShellConfig,
  ): ShellInitializer {
    ShellInitializer.instance ??= new ShellInitializer(logger, config);
    return ShellInitializer.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ShellInitializer.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    config: ShellConfig,
  ): ShellInitializer {
    return new ShellInitializer(logger, config);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger, config: ShellConfig) {
    this.logger = logger.child("ShellInitializer");
    this.config = config;
  }

  /**
   * Register shell's own system templates
   */
  public registerShellTemplates(templateRegistry: TemplateRegistry): void {
    this.logger.debug("Registering shell system templates");

    try {
      // Register knowledge query template for shell queries
      templateRegistry.register(
        knowledgeQueryTemplate.name,
        knowledgeQueryTemplate,
      );

      this.logger.debug("Shell system templates registered successfully");
    } catch (error) {
      this.logger.error("Failed to register shell templates", error);
      throw new Error(
        `Failed to register template: ${knowledgeQueryTemplate.name}`,
      );
    }
  }

  /**
   * Register base entity support
   * This provides fallback handling for generic entities
   */
  public registerBaseEntitySupport(
    entityRegistry: EntityRegistry,
    templateRegistry: TemplateRegistry,
  ): void {
    this.logger.debug("Registering base entity support");

    try {
      // Create base entity adapter
      const baseEntityAdapter = new BaseEntityAdapter();

      // Register with entity registry
      entityRegistry.registerEntityType(
        "base",
        baseEntityAdapter.schema,
        baseEntityAdapter,
      );

      // Register base entity display template
      templateRegistry.register("shell:base-entity-display", {
        name: "base-entity-display",
        description: "Display template for base entities",
        schema: baseEntitySchema,
        formatter: new BaseEntityFormatter(),
        requiredPermission: "public",
      });

      this.logger.debug("Base entity support registered successfully");
    } catch (error) {
      this.logger.error("Failed to register base entity support", error);
      throw new Error("Failed to register base entity type");
    }
  }

  /**
   * Initialize plugins
   */
  public async initializePlugins(pluginManager: PluginManager): Promise<void> {
    this.logger.info(`Found ${this.config.plugins.length} plugins to register`);

    try {
      // Register plugins from config
      for (const plugin of this.config.plugins) {
        this.logger.info(`Registering plugin: ${plugin.id}`);
        pluginManager.registerPlugin(plugin);
      }

      // Initialize all registered plugins
      await pluginManager.initializePlugins();

      this.logger.info("Plugin initialization complete");
    } catch (error) {
      this.logger.error("Failed to initialize plugins", error);
      throw new Error("Failed to initialize plugins");
    }
  }

  /**
   * Initialize all services required by Shell
   */
  public initializeServices(dependencies?: ShellDependencies): ShellServices {
    this.logger.debug("Initializing Shell services");

    // Create or use provided logger
    const logLevel = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    }[this.config.logging.level];

    const logger =
      dependencies?.logger ??
      Logger.createFresh({
        level: logLevel,
        context: this.config.logging.context,
      });

    // Create or use provided services
    const embeddingService =
      dependencies?.embeddingService ??
      EmbeddingService.getInstance(logger, this.config.embedding.cacheDir);
    const aiService =
      dependencies?.aiService ?? AIService.getInstance(this.config.ai, logger);

    // Core registries and services
    const serviceRegistry =
      dependencies?.serviceRegistry ?? ServiceRegistry.getInstance(logger);
    const entityRegistry =
      dependencies?.entityRegistry ?? EntityRegistry.getInstance(logger);
    const messageBus =
      dependencies?.messageBus ?? MessageBus.getInstance(logger);
    // Template registry
    const templateRegistry = TemplateRegistry.getInstance(logger);

    // DataSource registry
    const dataSourceRegistry = DataSourceRegistry.getInstance(logger);

    // Render and route services
    const renderService =
      dependencies?.renderService ??
      RenderService.getInstance(templateRegistry);
    const daemonRegistry =
      dependencies?.daemonRegistry ?? DaemonRegistry.getInstance(logger);
    const pluginManager =
      dependencies?.pluginManager ??
      PluginManager.getInstance(serviceRegistry, logger);

    // Permission and command services
    const permissionService = new PermissionService(this.config.permissions);
    const commandRegistry =
      dependencies?.commandRegistry ??
      CommandRegistry.getInstance(logger, permissionService);
    const mcpService =
      dependencies?.mcpService ?? MCPService.getInstance(messageBus, logger);

    // Job queue configuration
    const jobQueueDbConfig: JobQueueDbConfig = {
      url: this.config.jobQueueDatabase.url,
      ...(this.config.jobQueueDatabase.authToken && {
        authToken: this.config.jobQueueDatabase.authToken,
      }),
    };

    const jobQueueService =
      dependencies?.jobQueueService ??
      JobQueueService.getInstance(jobQueueDbConfig, logger);

    // Entity service with its database
    const entityService =
      dependencies?.entityService ??
      EntityService.getInstance({
        embeddingService,
        entityRegistry,
        logger,
        jobQueueService,
        dbConfig: {
          url: this.config.database.url,
          ...(this.config.database.authToken && {
            authToken: this.config.database.authToken,
          }),
        },
      });

    // Conversation service
    const conversationService =
      dependencies?.conversationService ??
      ConversationService.getInstance(logger, messageBus, {
        url: this.config.conversationDatabase.url,
        ...(this.config.conversationDatabase.authToken && {
          authToken: this.config.conversationDatabase.authToken,
        }),
      });

    // Content generator
    const contentService =
      dependencies?.contentService ??
      new ContentServiceClass({
        logger,
        entityService,
        aiService,
        templateRegistry,
        dataSourceRegistry,
      });

    // Register job handlers
    this.registerJobHandlers(jobQueueService, contentService, entityService);

    // Batch and progress management
    const batchJobManager = BatchJobManager.getInstance(
      jobQueueService,
      logger,
    );
    const jobProgressMonitor =
      dependencies?.jobProgressMonitor ??
      JobProgressMonitor.getInstance(
        jobQueueService,
        messageBus,
        batchJobManager,
        logger,
      );

    // Job queue worker
    const jobQueueWorker =
      dependencies?.jobQueueWorker ??
      JobQueueWorker.getInstance(jobQueueService, jobProgressMonitor, logger, {
        pollInterval: 100,
        concurrency: 1,
        autoStart: false,
      });

    return {
      logger,
      serviceRegistry,
      entityRegistry,
      messageBus,
      renderService,
      daemonRegistry,
      pluginManager,
      commandRegistry,
      templateRegistry,
      dataSourceRegistry,
      mcpService,
      embeddingService,
      entityService,
      aiService,
      conversationService,
      contentService,
      jobQueueService,
      jobQueueWorker,
      batchJobManager,
      jobProgressMonitor,
      permissionService,
    };
  }

  /**
   * Register job handlers for content generation and derivation
   */
  public registerJobHandlers(
    jobQueueService: JobQueueService,
    contentService: ContentService,
    entityService: EntityService,
  ): void {
    // Register content generation job handler with shell namespace
    const contentGenerationJobHandler = ContentGenerationJobHandler.createFresh(
      contentService,
      entityService,
    );
    jobQueueService.registerHandler(
      "shell:content-generation",
      contentGenerationJobHandler,
      "shell",
    );

    // Register content derivation job handler with shell namespace
    const contentDerivationJobHandler =
      ContentDerivationJobHandler.createFresh(entityService);
    jobQueueService.registerHandler(
      "shell:content-derivation",
      contentDerivationJobHandler,
      "shell",
    );
  }

  /**
   * Register services in the service registry
   * ONLY registers the three services that are actually resolved by plugins
   */
  public registerServices(services: ShellServices, shell: unknown): void {
    const { serviceRegistry, commandRegistry, mcpService } = services;

    // Only register the THREE services that are actually resolved
    serviceRegistry.register("shell", () => shell);
    serviceRegistry.register("commandRegistry", () => commandRegistry);
    serviceRegistry.register("mcpService", () => mcpService);

    // That's it! No other services are ever resolved through the registry
  }

  /**
   * Complete initialization process
   * Coordinates all initialization steps
   */
  public async initializeAll(
    templateRegistry: TemplateRegistry,
    entityRegistry: EntityRegistry,
    pluginManager: PluginManager,
  ): Promise<void> {
    this.logger.info("Starting Shell initialization");

    try {
      // Step 1: Register shell templates
      this.registerShellTemplates(templateRegistry);

      // Step 2: Register base entity support
      this.registerBaseEntitySupport(entityRegistry, templateRegistry);

      // Step 3: Initialize plugins
      await this.initializePlugins(pluginManager);

      this.logger.info("Shell initialization completed successfully");
    } catch (error) {
      this.logger.error("Shell initialization failed", error);
      throw error;
    }
  }
}
