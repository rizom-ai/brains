import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import { createDatabase, runMigrations } from "./db";
import { Registry } from "./registry/registry";
import { EntityRegistry } from "./entity/entityRegistry";
import { SchemaRegistry } from "./schema/schemaRegistry";
import { MessageBus } from "./messaging/messageBus";
import { PluginManager } from "./plugins/pluginManager";
import { EntityService } from "./entity/entityService";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "./embedding/embeddingService";
import { QueryProcessor } from "./query/queryProcessor";
import { BrainProtocol } from "./protocol/brainProtocol";
import { AIService } from "./ai/aiService";
import { Logger, LogLevel } from "@brains/utils";
import { MCPServer } from "@brains/mcp-server";
import { registerShellMCP } from "./mcp";
import type { QueryResult } from "./types";
import type { Command, CommandResponse } from "./protocol/brainProtocol";
import type { Plugin } from "@brains/types";
import { defaultQueryResponseSchema } from "./schemas/defaults";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";

/**
 * Optional dependencies that can be injected for testing
 */
export interface ShellDependencies {
  db?: LibSQLDatabase<Record<string, never>>;
  dbClient?: Client;
  logger?: Logger;
  embeddingService?: IEmbeddingService;
  aiService?: AIService;
  mcpServer?: MCPServer;
  entityService?: EntityService;
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

  private readonly config: ShellConfig;
  private readonly db: LibSQLDatabase<Record<string, never>>;
  private readonly dbClient: Client;
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
  private readonly aiService: AIService;
  private readonly mcpServer: MCPServer;
  private initialized = false;

  /**
   * Get the singleton instance of Shell
   */
  public static getInstance(config?: Partial<ShellConfig>): Shell {
    if (!Shell.instance) {
      const fullConfig = createShellConfig(config);
      Shell.instance = new Shell(fullConfig);
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
   * @param config - Configuration for the shell (required if dependencies are provided)
   * @param dependencies - Optional dependencies for testing
   */
  public static createFresh(
    config: Partial<ShellConfig>,
    dependencies?: ShellDependencies,
  ): Shell;
  public static createFresh(config?: Partial<ShellConfig>): Shell;
  public static createFresh(
    config?: Partial<ShellConfig>,
    dependencies?: ShellDependencies,
  ): Shell {
    const fullConfig = createShellConfig(config);
    return new Shell(fullConfig, dependencies);
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

    this.entityService =
      dependencies?.entityService ??
      EntityService.getInstance({
        db: this.db,
        embeddingService: this.embeddingService,
        entityRegistry: this.entityRegistry,
        logger: this.logger,
      });

    this.queryProcessor = QueryProcessor.getInstance({
      entityService: this.entityService,
      logger: this.logger,
      aiService: this.aiService,
    });

    this.brainProtocol = BrainProtocol.getInstance(
      this.logger,
      this.messageBus,
      this.queryProcessor,
    );

    // Create or use injected MCP server
    if (!dependencies?.mcpServer) {
      this.mcpServer = MCPServer.getInstance({
        name: "brain-mcp-server",
        version: "1.0.0",
        logger: this.logger,
      });

      // Register shell MCP capabilities
      registerShellMCP(this.mcpServer.getServer(), {
        queryProcessor: this.queryProcessor,
        brainProtocol: this.brainProtocol,
        entityService: this.entityService,
        schemaRegistry: this.schemaRegistry,
        logger: this.logger,
      });
    } else {
      this.mcpServer = dependencies.mcpServer;
    }

    // Register core components in the registry
    this.registry.register("shell", () => this);
    this.registry.register("entityRegistry", () => this.entityRegistry);
    this.registry.register("schemaRegistry", () => this.schemaRegistry);
    this.registry.register("messageBus", () => this.messageBus);
    this.registry.register("pluginManager", () => this.pluginManager);
    this.registry.register("entityService", () => this.entityService);
    this.registry.register("queryProcessor", () => this.queryProcessor);
    this.registry.register("brainProtocol", () => this.brainProtocol);
    this.registry.register("aiService", () => this.aiService);
    this.registry.register("mcpServer", () => this.mcpServer.getServer());
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
      // Run migrations if enabled
      if (this.config.features.runMigrationsOnInit) {
        this.logger.info("Running database migrations...");
        await runMigrations(this.db);
        this.logger.info("Database migrations completed");
      }

      // Initialize plugins if enabled
      if (this.config.features.enablePlugins) {
        await this.pluginManager.initializePlugins();
      }

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

    // Close database connection
    this.dbClient.close();

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
  ): Promise<QueryResult<unknown>> {
    if (!this.initialized) {
      throw new Error("Shell not initialized");
    }

    return this.queryProcessor.processQuery(query, {
      ...options,
      schema: defaultQueryResponseSchema,
    });
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

  public getAIService(): AIService {
    return this.aiService;
  }

  public getMCPServer(): MCPServer {
    return this.mcpServer;
  }

  public getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  public getLogger(): Logger {
    return this.logger;
  }
}
