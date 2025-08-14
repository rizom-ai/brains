import type { Logger } from "@brains/utils";
import type { ShellConfig } from "../config";
import type { EntityRegistry } from "@brains/entity-service";
import type { ContentGenerator } from "@brains/content-generator";
import type { PluginManager } from "@brains/plugins";
import { BaseEntityAdapter } from "../entities/base-entity-adapter";
import { knowledgeQueryTemplate } from "../templates";
import { BaseEntityFormatter, baseEntitySchema } from "@brains/entity-service";

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
  public registerShellTemplates(contentGenerator: ContentGenerator): void {
    this.logger.debug("Registering shell system templates");

    try {
      // Register knowledge query template for shell queries
      contentGenerator.registerTemplate(
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
    contentGenerator: ContentGenerator,
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
      contentGenerator.registerTemplate("shell:base-entity-display", {
        name: "shell:base-entity-display",
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
   * Complete initialization process
   * Coordinates all initialization steps
   */
  public async initializeAll(
    contentGenerator: ContentGenerator,
    entityRegistry: EntityRegistry,
    pluginManager: PluginManager,
  ): Promise<void> {
    this.logger.info("Starting Shell initialization");

    try {
      // Step 1: Register shell templates
      this.registerShellTemplates(contentGenerator);

      // Step 2: Register base entity support
      this.registerBaseEntitySupport(entityRegistry, contentGenerator);

      // Step 3: Initialize plugins
      await this.initializePlugins(pluginManager);

      this.logger.info("Shell initialization completed successfully");
    } catch (error) {
      this.logger.error("Shell initialization failed", error);
      throw error;
    }
  }
}
