import { ContentGenerationJobHandler } from "@brains/content-service";
import type { ContentService } from "@brains/content-service";
import type { IEntityRegistry, IEntityService } from "@brains/entity-service";
import type { IJobQueueService } from "@brains/job-queue";
import type { PluginManager, IShell } from "@brains/plugins";
import type { TemplateRegistry } from "@brains/templates";
import type { Logger } from "@brains/utils";

import { SHELL_ENTITY_TYPES } from "../constants";
import type { ShellConfig } from "../config";
import type { ShellDependencies, ShellServices } from "../types/shell-types";
import { createShellServices } from "./service-factory";
import * as shellRegistration from "./shell-registration";
import { resetCoreServiceSingletons } from "./service-singletons";

export type { ShellServices } from "../types/shell-types";
export type { PluginInitializeOptions } from "./shell-registration";

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
   * Only called if no plugin (e.g. note plugin) has already registered "base".
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

  public registerCanonicalIdentityLinkSupport(
    entityRegistry: IEntityRegistry,
  ): void {
    shellRegistration.registerCanonicalIdentityLinkSupport(
      entityRegistry,
      this.logger,
    );
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
    options?: shellRegistration.PluginInitializeOptions,
  ): Promise<void> {
    this.logger.debug("Starting Shell initialization");

    try {
      this.registerShellTemplates(templateRegistry);
      this.registerBaseEntityDisplayTemplate(templateRegistry);
      this.registerBrainCharacterSupport(entityRegistry);
      this.registerAnchorProfileSupport(entityRegistry);
      this.registerCanonicalIdentityLinkSupport(entityRegistry);
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
  resetCoreServiceSingletons();
}

export async function resetAllSingletons(): Promise<void> {
  // Import Shell here to avoid circular dependency at module level
  const { Shell } = await import("../shell");

  await Shell.resetInstance();
  resetServiceSingletons();
}
