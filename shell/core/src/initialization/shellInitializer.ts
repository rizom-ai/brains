import { Logger, LogLevel } from "@brains/utils";
import type { ShellConfig } from "../config";
import {
  EntityRegistry,
  EntityService,
  type IEntityRegistry,
  type IEntityService,
} from "@brains/entity-service";
import type { ContentService } from "@brains/content-service";
import { ContentGenerationJobHandler } from "@brains/content-service";
import { PluginManager } from "@brains/plugins";
import { ServiceRegistry } from "@brains/service-registry";
import { MessageBus } from "@brains/messaging-service";
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
  type IJobQueueService,
} from "@brains/job-queue";
import { BaseEntityAdapter } from "@brains/entity-service";
import { knowledgeQueryTemplate } from "@brains/content-service";
import { BaseEntityFormatter, baseEntitySchema } from "@brains/entity-service";
import type { ShellDependencies } from "../types/shell-types";
import { IdentityAdapter, IdentityService } from "@brains/identity-service";
import { ProfileAdapter, ProfileService } from "@brains/profile-service";
import {
  AgentService,
  createBrainAgentFactory,
  type IAgentService,
} from "@brains/agent-service";

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
  identityService: IdentityService;
  profileService: ProfileService;
  agentService: IAgentService;
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
    entityRegistry: IEntityRegistry,
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
   * Register identity entity support
   * This provides the brain's identity (role, purpose, values)
   */
  public registerIdentitySupport(entityRegistry: IEntityRegistry): void {
    this.logger.debug("Registering identity entity support");

    try {
      // Create identity adapter
      const identityAdapter = new IdentityAdapter();

      // Register with entity registry
      entityRegistry.registerEntityType(
        "identity",
        identityAdapter.schema,
        identityAdapter,
      );

      this.logger.debug("Identity entity support registered successfully");
    } catch (error) {
      this.logger.error("Failed to register identity entity support", error);
      throw new Error("Failed to register identity entity type");
    }
  }

  /**
   * Register profile entity support
   * This provides the brain owner's profile information
   */
  public registerProfileSupport(entityRegistry: IEntityRegistry): void {
    this.logger.debug("Registering profile entity support");

    try {
      // Create profile adapter
      const profileAdapter = new ProfileAdapter();

      // Register with entity registry
      entityRegistry.registerEntityType(
        "profile",
        profileAdapter.schema,
        profileAdapter,
      );

      this.logger.debug("Profile entity support registered successfully");
    } catch (error) {
      this.logger.error("Failed to register profile entity support", error);
      throw new Error("Failed to register profile entity type");
    }
  }

  /**
   * Initialize plugins
   */
  public async initializePlugins(pluginManager: PluginManager): Promise<void> {
    this.logger.debug(
      `Found ${this.config.plugins.length} plugins to register`,
    );

    try {
      // Register plugins from config
      for (const plugin of this.config.plugins) {
        this.logger.debug(`Registering plugin: ${plugin.id}`);
        pluginManager.registerPlugin(plugin);
      }

      // Initialize all registered plugins
      await pluginManager.initializePlugins();

      this.logger.debug("Plugin initialization complete");
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
    const entityRegistry = EntityRegistry.getInstance(logger);
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

    // Permission service
    const permissionService = new PermissionService(this.config.permissions);
    const mcpService =
      dependencies?.mcpService ?? MCPService.getInstance(messageBus, logger);

    // Job queue configuration
    const jobQueueDbConfig: JobQueueDbConfig = {
      url: this.config.jobQueueDatabase.url,
      ...(this.config.jobQueueDatabase.authToken && {
        authToken: this.config.jobQueueDatabase.authToken,
      }),
    };

    const jobQueueService = JobQueueService.getInstance(
      jobQueueDbConfig,
      logger,
    );

    // Entity service with its database
    const entityService = EntityService.getInstance({
      embeddingService,
      entityRegistry,
      logger,
      jobQueueService,
      messageBus,
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

    // Identity service
    const identityService = IdentityService.getInstance(
      entityService,
      logger,
      this.config.identity,
    );

    // Subscribe to identity entity changes for cache refresh
    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      "entity:created",
      async (message) => {
        if (
          message.payload.entityType === "identity" &&
          message.payload.entityId === "identity"
        ) {
          await identityService.refreshCache();
          logger.debug("Identity entity created, cache refreshed");
        }
        return { success: true };
      },
    );

    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      "entity:updated",
      async (message) => {
        if (
          message.payload.entityType === "identity" &&
          message.payload.entityId === "identity"
        ) {
          await identityService.refreshCache();
          logger.debug("Identity entity updated, cache refreshed");
        }
        return { success: true };
      },
    );

    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      "entity:deleted",
      async (message) => {
        if (
          message.payload.entityType === "identity" &&
          message.payload.entityId === "identity"
        ) {
          await identityService.refreshCache();
          logger.debug("Identity entity deleted, cache refreshed");
        }
        return { success: true };
      },
    );

    // Profile service
    const profileService = ProfileService.getInstance(
      entityService,
      logger,
      this.config.profile,
    );

    // Create agent factory with AI service config
    const agentFactory = createBrainAgentFactory({
      model: aiService.getModel(),
      webSearch: aiService.getConfig().webSearch,
      temperature: aiService.getConfig().temperature,
      maxTokens: aiService.getConfig().maxTokens,
    });

    // Agent service for AI-powered conversation
    const agentService = AgentService.getInstance(
      mcpService,
      conversationService,
      identityService,
      logger,
      { agentFactory },
    );

    // Subscribe to profile entity changes for cache refresh
    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      "entity:created",
      async (message) => {
        if (
          message.payload.entityType === "profile" &&
          message.payload.entityId === "profile"
        ) {
          await profileService.refreshCache();
          logger.debug("Profile entity created, cache refreshed");
        }
        return { success: true };
      },
    );

    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      "entity:updated",
      async (message) => {
        if (
          message.payload.entityType === "profile" &&
          message.payload.entityId === "profile"
        ) {
          await profileService.refreshCache();
          logger.debug("Profile entity updated, cache refreshed");
        }
        return { success: true };
      },
    );

    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      "entity:deleted",
      async (message) => {
        if (
          message.payload.entityType === "profile" &&
          message.payload.entityId === "profile"
        ) {
          await profileService.refreshCache();
          logger.debug("Profile entity deleted, cache refreshed");
        }
        return { success: true };
      },
    );

    // Register job handlers
    this.registerJobHandlers(jobQueueService, contentService, entityService);

    // Batch and progress management
    const batchJobManager = BatchJobManager.getInstance(
      jobQueueService,
      logger,
    );
    const jobProgressMonitor = JobProgressMonitor.getInstance(
      jobQueueService,
      messageBus,
      batchJobManager,
      logger,
    );

    // Job queue worker
    const jobQueueWorker = JobQueueWorker.getInstance(
      jobQueueService,
      jobProgressMonitor,
      logger,
      {
        pollInterval: 100,
        concurrency: 1,
        autoStart: false,
      },
    );

    return {
      logger,
      serviceRegistry,
      entityRegistry,
      messageBus,
      renderService,
      daemonRegistry,
      pluginManager,
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
      identityService,
      profileService,
      agentService,
    };
  }

  /**
   * Register job handlers for content generation and derivation
   */
  public registerJobHandlers(
    jobQueueService: IJobQueueService,
    contentService: ContentService,
    entityService: IEntityService,
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
  }

  /**
   * Register services in the service registry
   * ONLY registers the services that are actually resolved by plugins
   */
  public registerServices(services: ShellServices, shell: unknown): void {
    const { serviceRegistry, mcpService } = services;

    // Only register the services that are actually resolved
    serviceRegistry.register("shell", () => shell);
    serviceRegistry.register("mcpService", () => mcpService);
  }

  /**
   * Complete initialization process
   * Coordinates all initialization steps
   */
  public async initializeAll(
    templateRegistry: TemplateRegistry,
    entityRegistry: IEntityRegistry,
    pluginManager: PluginManager,
  ): Promise<void> {
    this.logger.debug("Starting Shell initialization");

    try {
      // Step 1: Register shell templates
      this.registerShellTemplates(templateRegistry);

      // Step 2: Register base entity support
      this.registerBaseEntitySupport(entityRegistry, templateRegistry);

      // Step 3: Register identity entity support
      this.registerIdentitySupport(entityRegistry);

      // Step 4: Register profile entity support
      this.registerProfileSupport(entityRegistry);

      // Step 5: Initialize plugins
      await this.initializePlugins(pluginManager);

      this.logger.debug("Shell ready");
    } catch (error) {
      this.logger.error("Shell initialization failed", error);
      throw error;
    }
  }
}
