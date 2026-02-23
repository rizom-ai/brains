import {
  AgentService,
  createBrainAgentFactory,
  type IAgentService,
} from "@brains/agent-service";
import { AIService, type IAIService } from "@brains/ai-service";
import {
  ContentGenerationJobHandler,
  ContentService as ContentServiceClass,
  knowledgeQueryTemplate,
} from "@brains/content-service";
import type { ContentService } from "@brains/content-service";
import {
  ConversationService,
  type IConversationService,
} from "@brains/conversation-service";
import { DaemonRegistry } from "@brains/daemon-registry";
import { DataSourceRegistry } from "@brains/entity-service";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "@brains/embedding-service";
import {
  BaseEntityFormatter,
  EntityRegistry,
  EntityService,
  baseEntitySchema,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
  type EntityAdapter,
  type IEntityRegistry,
  type IEntityService,
} from "@brains/entity-service";
import { IdentityAdapter, IdentityService } from "@brains/identity-service";
import { imageAdapter, imageSchema } from "@brains/image";
import {
  BatchJobManager,
  JobProgressMonitor,
  JobQueueService,
  JobQueueWorker,
  type IJobQueueService,
  type JobQueueDbConfig,
} from "@brains/job-queue";
import { MCPService, type IMCPService } from "@brains/mcp-service";
import { MessageBus, type IMessageBus } from "@brains/messaging-service";
import { PluginManager, type IShell } from "@brains/plugins";
import { ProfileAdapter, ProfileService } from "@brains/profile-service";
import {
  PermissionService,
  RenderService,
  TemplateRegistry,
} from "@brains/templates";
import { Logger, LogLevel, type z } from "@brains/utils";

import { SHELL_ENTITY_TYPES, SHELL_TEMPLATE_NAMES } from "../constants";
import type { ShellConfig } from "../config";
import type { ShellDependencies } from "../types/shell-types";

/**
 * Services initialized by ShellInitializer
 */
export interface ShellServices {
  logger: Logger;
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
 * Subscribe to entity lifecycle events (created, updated, deleted) for cache invalidation.
 * Calls the provided refresh callback when the specified entity type/id changes.
 */
function subscribeToEntityCacheInvalidation(
  messageBus: IMessageBus,
  entityType: string,
  entityId: string,
  refreshCache: () => Promise<void>,
  logger: Logger,
): (() => void)[] {
  const events = [
    "entity:created",
    "entity:updated",
    "entity:deleted",
  ] as const;

  return events.map((event) =>
    messageBus.subscribe<{ entityType: string; entityId: string }, void>(
      event,
      async (message) => {
        if (
          message.payload.entityType === entityType &&
          message.payload.entityId === entityId
        ) {
          await refreshCache();
          const action = event.replace("entity:", "");
          logger.debug(`${entityType} entity ${action}, cache refreshed`);
        }
        return { success: true };
      },
    ),
  );
}

export class ShellInitializer {
  private static instance: ShellInitializer | null = null;

  private logger: Logger;
  private config: ShellConfig;

  public static getInstance(
    logger: Logger,
    config: ShellConfig,
  ): ShellInitializer {
    ShellInitializer.instance ??= new ShellInitializer(logger, config);
    return ShellInitializer.instance;
  }

  public static resetInstance(): void {
    ShellInitializer.instance = null;
  }

  public static createFresh(
    logger: Logger,
    config: ShellConfig,
  ): ShellInitializer {
    return new ShellInitializer(logger, config);
  }

  private constructor(logger: Logger, config: ShellConfig) {
    this.logger = logger.child("ShellInitializer");
    this.config = config;
  }

  public registerShellTemplates(templateRegistry: TemplateRegistry): void {
    templateRegistry.register(
      knowledgeQueryTemplate.name,
      knowledgeQueryTemplate,
    );
    this.logger.debug("Shell system templates registered");
  }

  public registerBaseEntitySupport(
    entityRegistry: IEntityRegistry,
    templateRegistry: TemplateRegistry,
  ): void {
    const baseEntityAdapter: EntityAdapter<BaseEntity> = {
      entityType: "base",
      schema: baseEntitySchema,
      toMarkdown: (entity) => entity.content,
      fromMarkdown: (markdown) => ({ content: markdown }),
      extractMetadata: () => ({}),
      parseFrontMatter: <T>(md: string, schema: z.ZodSchema<T>): T =>
        parseMarkdownWithFrontmatter(md, schema).metadata,
      generateFrontMatter: () => "",
    };

    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.BASE,
      baseEntitySchema,
      baseEntityAdapter,
    );

    templateRegistry.register(SHELL_TEMPLATE_NAMES.BASE_ENTITY_DISPLAY, {
      name: "base-entity-display",
      description: "Display template for base entities",
      schema: baseEntitySchema,
      formatter: new BaseEntityFormatter(),
      requiredPermission: "public",
    });

    this.logger.debug("Base entity support registered");
  }

  public registerIdentitySupport(entityRegistry: IEntityRegistry): void {
    const identityAdapter = new IdentityAdapter();
    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.IDENTITY,
      identityAdapter.schema,
      identityAdapter,
    );
    this.logger.debug("Identity entity support registered");
  }

  public registerProfileSupport(entityRegistry: IEntityRegistry): void {
    const profileAdapter = new ProfileAdapter();
    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.PROFILE,
      profileAdapter.schema,
      profileAdapter,
    );
    this.logger.debug("Profile entity support registered");
  }

  public registerImageSupport(entityRegistry: IEntityRegistry): void {
    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.IMAGE,
      imageSchema,
      imageAdapter,
      { embeddable: false },
    );
    this.logger.debug("Image entity support registered");
  }

  public async initializePlugins(pluginManager: PluginManager): Promise<void> {
    this.logger.debug(
      `Found ${this.config.plugins.length} plugins to register`,
    );

    for (const plugin of this.config.plugins) {
      this.logger.debug(`Registering plugin: ${plugin.id}`);
      pluginManager.registerPlugin(plugin);
    }

    await pluginManager.initializePlugins();
    this.logger.debug("Plugin initialization complete");
  }

  public initializeServices(dependencies?: ShellDependencies): ShellServices {
    this.logger.debug("Initializing Shell services");

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

    const embeddingService =
      dependencies?.embeddingService ??
      EmbeddingService.getInstance(logger, this.config.embedding.cacheDir);
    const aiService =
      dependencies?.aiService ?? AIService.getInstance(this.config.ai, logger);
    const entityRegistry = EntityRegistry.getInstance(logger);
    const messageBus =
      dependencies?.messageBus ?? MessageBus.getInstance(logger);
    const templateRegistry = TemplateRegistry.getInstance(logger);
    const dataSourceRegistry = DataSourceRegistry.getInstance(logger);
    const renderService =
      dependencies?.renderService ??
      RenderService.getInstance(templateRegistry);
    const daemonRegistry =
      dependencies?.daemonRegistry ?? DaemonRegistry.getInstance(logger);
    const pluginManager =
      dependencies?.pluginManager ?? PluginManager.getInstance(logger);
    const permissionService = new PermissionService(this.config.permissions);
    const mcpService =
      dependencies?.mcpService ?? MCPService.getInstance(messageBus, logger);

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

    const conversationService =
      dependencies?.conversationService ??
      ConversationService.getInstance(logger, messageBus, {
        url: this.config.conversationDatabase.url,
        ...(this.config.conversationDatabase.authToken && {
          authToken: this.config.conversationDatabase.authToken,
        }),
      });

    const contentService =
      dependencies?.contentService ??
      new ContentServiceClass({
        logger,
        entityService,
        aiService,
        templateRegistry,
        dataSourceRegistry,
      });

    const identityService = IdentityService.getInstance(
      entityService,
      logger,
      this.config.identity,
    );

    subscribeToEntityCacheInvalidation(
      messageBus,
      SHELL_ENTITY_TYPES.IDENTITY,
      SHELL_ENTITY_TYPES.IDENTITY,
      () => identityService.refreshCache(),
      logger,
    );

    const profileService = ProfileService.getInstance(
      entityService,
      logger,
      this.config.profile,
    );

    const agentFactory = createBrainAgentFactory({
      model: aiService.getModel(),
      webSearch: aiService.getConfig().webSearch,
      temperature: aiService.getConfig().temperature,
      maxTokens: aiService.getConfig().maxTokens,
      messageBus,
    });

    const agentService = AgentService.getInstance(
      mcpService,
      conversationService,
      identityService,
      logger,
      { agentFactory },
    );

    subscribeToEntityCacheInvalidation(
      messageBus,
      SHELL_ENTITY_TYPES.PROFILE,
      SHELL_ENTITY_TYPES.PROFILE,
      () => profileService.refreshCache(),
      logger,
    );

    // Initialize identity and profile services after sync completes.
    // This ensures remote data is pulled before defaults are created for empty DB.
    messageBus.subscribe<{ success: boolean }, void>(
      "sync:initial:completed",
      async () => {
        logger.debug(
          "sync:initial:completed received, initializing identity and profile services",
        );
        await identityService.initialize();
        await profileService.initialize();
        logger.debug("Identity and profile services initialized");
        return { success: true };
      },
    );

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

  public registerJobHandlers(
    jobQueueService: IJobQueueService,
    contentService: ContentService,
    entityService: IEntityService,
  ): void {
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

  public wireShell(services: ShellServices, shell: IShell): void {
    services.pluginManager.setShell(shell);
  }

  public async initializeAll(
    templateRegistry: TemplateRegistry,
    entityRegistry: IEntityRegistry,
    pluginManager: PluginManager,
  ): Promise<void> {
    this.logger.debug("Starting Shell initialization");

    try {
      this.registerShellTemplates(templateRegistry);
      this.registerBaseEntitySupport(entityRegistry, templateRegistry);
      this.registerIdentitySupport(entityRegistry);
      this.registerProfileSupport(entityRegistry);
      this.registerImageSupport(entityRegistry);
      await this.initializePlugins(pluginManager);

      this.logger.debug("Shell ready");
    } catch (error) {
      this.logger.error("Shell initialization failed", error);
      throw error;
    }
  }
}
