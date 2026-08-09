import { ContentGenerationJobHandler } from "@brains/content-service";
import type { ContentService } from "@brains/content-service";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import type { IJobQueueService } from "@brains/job-queue";
import { SHELL_CHANNELS } from "@brains/contracts";
import type { PluginManager, IShell } from "@brains/plugins";
import type { TemplateRegistry } from "@brains/templates";
import type { Logger } from "@brains/utils/logger";

import { SHELL_ENTITY_TYPES } from "../constants";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import { createShellServices } from "./service-factory";
import type { ShellLifecycle } from "./shell-lifecycle";
import * as shellRegistration from "./shell-registration";
import type {
  LocalDatabaseEndpointConfig,
  RuntimeProcessRole,
} from "../runtime-process-role";

export type { ShellServices } from "../types/shell-types";
export type { PluginInitializeOptions } from "./shell-registration";

export class ShellInitializer {
  private readonly logger: Logger;
  private readonly config: ShellConfig;
  private readonly processRole: RuntimeProcessRole | undefined;
  private readonly localDatabaseEndpoint:
    LocalDatabaseEndpointConfig | undefined;

  public static createFresh(
    logger: Logger,
    config: ShellConfig,
    processRole?: RuntimeProcessRole,
    localDatabaseEndpoint?: LocalDatabaseEndpointConfig,
  ): ShellInitializer {
    return new ShellInitializer(
      logger,
      config,
      processRole,
      localDatabaseEndpoint,
    );
  }

  private constructor(
    logger: Logger,
    config: ShellConfig,
    processRole?: RuntimeProcessRole,
    localDatabaseEndpoint?: LocalDatabaseEndpointConfig,
  ) {
    this.logger = logger.child("ShellInitializer");
    this.config = config;
    this.processRole = processRole;
    this.localDatabaseEndpoint = localDatabaseEndpoint;
  }

  public registerShellTemplates(templateRegistry: TemplateRegistry): void {
    shellRegistration.registerShellTemplates(templateRegistry, this.logger);
  }

  public registerBaseEntityDisplayTemplate(
    templateRegistry: TemplateRegistry,
  ): void {
    shellRegistration.registerBaseEntityDisplayTemplate(
      templateRegistry,
      this.logger,
    );
  }

  /**
   * Register a fallback base entity adapter.
   * Only called if no plugin (e.g. note plugin) has already registered "note".
   */
  public registerFallbackBaseEntity(entityRegistry: IEntityRegistry): void {
    shellRegistration.registerFallbackBaseEntity(entityRegistry, this.logger);
  }

  public registerBrainCharacterSupport(entityRegistry: IEntityRegistry): void {
    shellRegistration.registerBrainCharacterSupport(
      entityRegistry,
      this.logger,
    );
  }

  public registerAnchorProfileSupport(entityRegistry: IEntityRegistry): void {
    shellRegistration.registerAnchorProfileSupport(entityRegistry, this.logger);
  }

  public async initializePlugins(
    pluginManager: PluginManager,
    options?: shellRegistration.PluginInitializeOptions,
  ): Promise<void> {
    await shellRegistration.initializeConfiguredPlugins({
      plugins: this.config.plugins,
      pluginManager,
      logger: this.logger,
      initOptions: options,
    });
  }

  public initializeServices(
    lifecycle: ShellLifecycle,
    dependencies?: ShellDependencies,
  ): ShellServices {
    return createShellServices({
      config: this.config,
      dependencies,
      initializerLogger: this.logger,
      lifecycle,
      ...(this.processRole && { processRole: this.processRole }),
      ...(this.localDatabaseEndpoint && {
        localDatabaseEndpoint: this.localDatabaseEndpoint,
      }),
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
      SHELL_CHANNELS.contentGeneration,
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
    options?: shellRegistration.PluginInitializeOptions,
  ): Promise<void> {
    this.logger.debug("Starting Shell initialization");

    try {
      this.registerShellTemplates(templateRegistry);
      this.registerBaseEntityDisplayTemplate(templateRegistry);
      this.registerBrainCharacterSupport(entityRegistry);
      this.registerAnchorProfileSupport(entityRegistry);
      await this.initializePlugins(pluginManager, options);

      // Register fallback base entity adapter only if no plugin claimed "note"
      if (!entityRegistry.hasEntityType(SHELL_ENTITY_TYPES.NOTE)) {
        this.registerFallbackBaseEntity(entityRegistry);
      }

      this.logger.debug("Shell registration phase complete");
    } catch (error) {
      this.logger.error("Shell initialization failed", error);
      throw error;
    }
  }
}
