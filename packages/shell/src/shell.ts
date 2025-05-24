import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { Registry } from "./registry/registry";
import { EntityRegistry } from "./entity/entityRegistry";
import { SchemaRegistry } from "./schema/schemaRegistry";
import { MessageBus } from "./messaging/messageBus";
import { PluginManager } from "./plugins/pluginManager";
import { EntityService } from "./entity/entityService";
import type { IEmbeddingService } from "./embedding/embeddingService";
import { QueryProcessor } from "./query/queryProcessor";
import { BrainProtocol } from "./protocol/brainProtocol";
import type { Logger } from "@personal-brain/utils";
import type { QueryResult } from "./types";
import type { Command, CommandResponse } from "./protocol/brainProtocol";
import type { Plugin } from "./plugins/pluginManager";

export interface ShellConfig {
  db: LibSQLDatabase<Record<string, never>>;
  logger: Logger;
  embeddingService: IEmbeddingService;
  enablePlugins?: boolean;
}

/**
 * Shell - The main entry point for the Brain system
 *
 * This class encapsulates all core functionality and provides
 * a unified interface for interacting with the Brain.
 * Follows Component Interface Standardization pattern.
 */
export class Shell {
  private static instance: Shell | null = null;

  private readonly db: LibSQLDatabase<Record<string, never>>;
  private readonly logger: Logger;
  private readonly registry: Registry;
  private readonly entityRegistry: EntityRegistry;
  private readonly schemaRegistry: SchemaRegistry;
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly embeddingService: IEmbeddingService;
  private readonly entityService: EntityService;
  private readonly queryProcessor: QueryProcessor;
  private readonly brainProtocol: BrainProtocol;
  private initialized = false;

  /**
   * Get the singleton instance of Shell
   */
  public static getInstance(config?: ShellConfig): Shell {
    if (!Shell.instance) {
      if (!config) {
        throw new Error(
          "Shell configuration required for first initialization",
        );
      }
      Shell.instance = new Shell(config);
    }
    return Shell.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (Shell.instance) {
      Shell.instance.shutdown();
      Shell.instance = null;
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: ShellConfig): Shell {
    return new Shell(config);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: ShellConfig) {
    this.logger = config.logger;

    // Use the provided Drizzle database
    this.db = config.db;

    // Use the provided embedding service
    this.embeddingService = config.embeddingService;

    // Initialize core components (they are all singletons)
    this.registry = Registry.getInstance(this.logger);
    this.entityRegistry = EntityRegistry.getInstance(this.logger);
    this.schemaRegistry = SchemaRegistry.getInstance(this.logger);
    this.messageBus = MessageBus.getInstance(this.logger);
    this.pluginManager = PluginManager.getInstance(
      this.registry,
      this.logger,
      this.messageBus,
    );

    this.entityService = EntityService.getInstance({
      db: this.db,
      embeddingService: this.embeddingService,
      entityRegistry: this.entityRegistry,
      logger: this.logger,
    });

    this.queryProcessor = QueryProcessor.getInstance({
      entityService: this.entityService,
      logger: this.logger,
    });

    this.brainProtocol = BrainProtocol.getInstance(
      this.logger,
      this.messageBus,
      this.queryProcessor,
    );

    // Register core components in the registry
    this.registry.register("shell", () => this);
    this.registry.register("entityRegistry", () => this.entityRegistry);
    this.registry.register("schemaRegistry", () => this.schemaRegistry);
    this.registry.register("messageBus", () => this.messageBus);
    this.registry.register("pluginManager", () => this.pluginManager);
    this.registry.register("entityService", () => this.entityService);
    this.registry.register("queryProcessor", () => this.queryProcessor);
    this.registry.register("brainProtocol", () => this.brainProtocol);
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
      // Initialize plugins
      await this.pluginManager.initializePlugins();

      this.initialized = true;
      this.logger.info("Shell initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Shell", error);
      throw error;
    }
  }

  /**
   * Shutdown the Shell and clean up resources
   */
  public shutdown(): void {
    this.logger.info("Shutting down Shell");

    // Cleanup in reverse order of initialization
    // Disable all plugins
    for (const [pluginId] of this.pluginManager.getAllPlugins()) {
      this.pluginManager.disablePlugin(pluginId);
    }

    // Clear registries
    this.registry.clear();

    this.initialized = false;
    this.logger.info("Shell shutdown complete");
  }

  /**
   * Process a natural language query
   */
  public async query(
    query: string,
    options?: {
      userId?: string;
      conversationId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<QueryResult> {
    if (!this.initialized) {
      throw new Error("Shell not initialized");
    }

    return this.queryProcessor.processQuery(query, options);
  }

  /**
   * Execute a command
   */
  public async executeCommand(command: Command): Promise<CommandResponse> {
    if (!this.initialized) {
      throw new Error("Shell not initialized");
    }

    return this.brainProtocol.executeCommand(command);
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: Plugin): void {
    if (!this.initialized) {
      throw new Error("Shell not initialized");
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

  public getQueryProcessor(): QueryProcessor {
    return this.queryProcessor;
  }

  public getBrainProtocol(): BrainProtocol {
    return this.brainProtocol;
  }

  public getEntityService(): EntityService {
    return this.entityService;
  }

  public getSchemaRegistry(): SchemaRegistry {
    return this.schemaRegistry;
  }
}
