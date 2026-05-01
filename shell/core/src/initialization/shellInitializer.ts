import {
  AgentService,
  AIService,
  OnlineEmbeddingProvider,
} from "@brains/ai-service";
import {
  ContentGenerationJobHandler,
  knowledgeQueryTemplate,
} from "@brains/content-service";
import type { ContentService } from "@brains/content-service";
import { ConversationService } from "@brains/conversation-service";
import { DaemonRegistry } from "../daemon-registry";
import { DataSourceRegistry } from "@brains/entity-service";
import {
  BaseEntityFormatter,
  EntityRegistry,
  EntityService,
  FallbackEntityAdapter,
  baseEntitySchema,
  type IEntityRegistry,
  type IEntityService,
} from "@brains/entity-service";
import {
  BrainCharacterAdapter,
  BrainCharacterService,
} from "@brains/identity-service";
import {
  AnchorProfileAdapter,
  AnchorProfileService,
} from "@brains/identity-service";
import {
  BatchJobManager,
  JobProgressMonitor,
  JobQueueService,
  JobQueueWorker,
  type IJobQueueService,
} from "@brains/job-queue";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import {
  PluginManager,
  type IShell,
  type PluginRegistrationContext,
} from "@brains/plugins";
import { RenderService, TemplateRegistry } from "@brains/templates";
import type { Logger } from "@brains/utils";

import { SHELL_ENTITY_TYPES, SHELL_TEMPLATE_NAMES } from "../constants";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import { createShellServices } from "./service-factory";

export type { ShellServices } from "../types/shell-types";

export interface PluginInitializeOptions {
  registerOnly?: boolean;
  registrationContext?: PluginRegistrationContext;
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

  public registerBaseEntityDisplayTemplate(
    templateRegistry: TemplateRegistry,
  ): void {
    templateRegistry.register(SHELL_TEMPLATE_NAMES.BASE_ENTITY_DISPLAY, {
      name: "base-entity-display",
      description: "Display template for base entities",
      schema: baseEntitySchema,
      formatter: new BaseEntityFormatter(),
      requiredPermission: "public",
    });
    this.logger.debug("Base entity display template registered");
  }

  /**
   * Register a fallback base entity adapter.
   * Only called if no plugin (e.g. note plugin) has already registered "base".
   */
  public registerFallbackBaseEntity(entityRegistry: IEntityRegistry): void {
    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.BASE,
      baseEntitySchema,
      new FallbackEntityAdapter(),
    );

    this.logger.debug("Fallback base entity adapter registered");
  }

  public registerBrainCharacterSupport(entityRegistry: IEntityRegistry): void {
    const characterAdapter = new BrainCharacterAdapter();
    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.BRAIN_CHARACTER,
      characterAdapter.schema,
      characterAdapter,
    );
    this.logger.debug("Brain character entity support registered");
  }

  public registerAnchorProfileSupport(entityRegistry: IEntityRegistry): void {
    const profileAdapter = new AnchorProfileAdapter();
    entityRegistry.registerEntityType(
      SHELL_ENTITY_TYPES.ANCHOR_PROFILE,
      profileAdapter.schema,
      profileAdapter,
    );
    this.logger.debug("Anchor profile entity support registered");
  }

  public async initializePlugins(
    pluginManager: PluginManager,
    options?: PluginInitializeOptions,
  ): Promise<void> {
    this.logger.debug(
      `Found ${this.config.plugins.length} plugins to register`,
    );

    for (const plugin of this.config.plugins) {
      this.logger.debug(`Registering plugin: ${plugin.id}`);
      pluginManager.registerPlugin(plugin);
    }

    await pluginManager.initializePlugins(options?.registrationContext);

    if (!options?.registerOnly) {
      for (const { id, error } of pluginManager.getFailedPlugins()) {
        const plugin = pluginManager.getPlugin(id);
        if (plugin?.requiresDaemonStartup?.()) {
          throw error;
        }
      }
    }

    this.logger.debug("Plugin initialization complete");
  }

  public initializeServices(dependencies?: ShellDependencies): ShellServices {
    return createShellServices({
      config: this.config,
      dependencies,
      initializerLogger: this.logger,
    });
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
    options?: PluginInitializeOptions,
  ): Promise<void> {
    this.logger.debug("Starting Shell initialization");

    try {
      this.registerShellTemplates(templateRegistry);
      this.registerBaseEntityDisplayTemplate(templateRegistry);
      this.registerBrainCharacterSupport(entityRegistry);
      this.registerAnchorProfileSupport(entityRegistry);
      await this.initializePlugins(pluginManager, options);

      // Register fallback base entity adapter only if no plugin claimed "base"
      if (!entityRegistry.hasEntityType(SHELL_ENTITY_TYPES.BASE)) {
        this.registerFallbackBaseEntity(entityRegistry);
      }

      this.logger.debug("Shell registration phase complete");
    } catch (error) {
      this.logger.error("Shell initialization failed", error);
      throw error;
    }
  }
}

/**
 * Reset all service singletons (sync).
 * Closes DB connections and nulls static references so the next
 * getInstance() / createFresh() call creates brand-new instances.
 *
 * Does NOT touch Shell.instance — call Shell.resetInstance() or
 * shell.shutdown() separately when you need to stop background services.
 */
export function resetServiceSingletons(): void {
  ShellInitializer.resetInstance();
  EntityService.resetInstance();
  EntityRegistry.resetInstance();
  DataSourceRegistry.resetInstance();
  OnlineEmbeddingProvider.resetInstance();
  ConversationService.resetInstance();
  PluginManager.resetInstance();
  MCPService.resetInstance();
  MessageBus.resetInstance();
  TemplateRegistry.resetInstance();
  RenderService.resetInstance();
  DaemonRegistry.resetInstance();
  AIService.resetInstance();
  AgentService.resetInstance();
  BrainCharacterService.resetInstance();
  AnchorProfileService.resetInstance();
  JobQueueService.resetInstance();
  BatchJobManager.resetInstance();
  JobQueueWorker.resetInstance();
  JobProgressMonitor.resetInstance();
}

export async function resetAllSingletons(): Promise<void> {
  // Import Shell here to avoid circular dependency at module level
  const { Shell } = await import("../shell");

  await Shell.resetInstance();
  resetServiceSingletons();
}
