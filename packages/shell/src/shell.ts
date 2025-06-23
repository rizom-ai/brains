import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import { createDatabase, enableWALMode } from "@brains/db";
import { Registry } from "./registry/registry";
import { EntityRegistry } from "./entity/entityRegistry";
import { MessageBus } from "./messaging/messageBus";
import { PluginManager, PluginEvent } from "./plugins/pluginManager";
import { EntityService } from "./entity/entityService";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "./embedding/embeddingService";
import { QueryProcessor } from "./query/queryProcessor";
import { AIService } from "./ai/aiService";
import { Logger, LogLevel } from "@brains/utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerShellMCP } from "./mcp";
import type { QueryResult } from "./types";
import type { Plugin } from "@brains/types";
import {
  baseEntitySchema,
  defaultQueryResponseSchema,
  simpleTextResponseSchema,
  createEntityResponseSchema,
  updateEntityResponseSchema,
} from "@brains/types";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";
import { ViewRegistry } from "./views/view-registry";
import {
  SimpleTextResponseFormatter,
  DefaultQueryResponseFormatter,
  CreateEntityResponseFormatter,
  UpdateEntityResponseFormatter,
} from "@brains/formatters";
import { BaseEntityAdapter, BaseEntityFormatter } from "@brains/base-entity";
import { ContentGenerationService, ContentRegistry } from "./content";
import { GenericYamlFormatter } from "./content/formatters/genericYamlFormatter";
import { DefaultYamlFormatter } from "./content/formatters/defaultYamlFormatter";
import { queryResponseTemplate, type QueryResponse } from "./templates/query-response";

/**
 * Optional dependencies that can be injected for testing
 */
export interface ShellDependencies {
  db?: LibSQLDatabase<Record<string, never>>;
  dbClient?: Client;
  logger?: Logger;
  embeddingService?: IEmbeddingService;
  aiService?: AIService;
  mcpServer?: McpServer;
  entityService?: EntityService;
  registry?: Registry;
  entityRegistry?: EntityRegistry;
  contentRegistry?: ContentRegistry;
  messageBus?: MessageBus;
  viewRegistry?: ViewRegistry;
  pluginManager?: PluginManager;
  queryProcessor?: QueryProcessor;
  contentGenerationService?: ContentGenerationService;
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
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly viewRegistry: ViewRegistry;
  private readonly embeddingService: IEmbeddingService;
  private readonly entityService: EntityService;
  private readonly queryProcessor: QueryProcessor;
  private readonly aiService: AIService;
  private readonly contentGenerationService: ContentGenerationService;
  private readonly contentRegistry: ContentRegistry;
  private readonly mcpServer: McpServer;
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

    // Create fresh instances of all registries
    const logger =
      dependencies?.logger ??
      Logger.createFresh({
        level: LogLevel.INFO,
        context: fullConfig.logging.context,
      });

    const registry = Registry.createFresh(logger);
    const entityRegistry = EntityRegistry.createFresh(logger);
    const messageBus = MessageBus.createFresh(logger);
    const pluginManager = PluginManager.createFresh(
      registry,
      logger,
      messageBus,
    );
    const contentGenerationService = ContentGenerationService.createFresh();

    // Merge fresh instances with any provided dependencies
    const freshDependencies: ShellDependencies = {
      ...dependencies,
      logger,
      registry,
      entityRegistry,
      messageBus,
      pluginManager,
      contentGenerationService,
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
    this.registry = dependencies?.registry ?? Registry.getInstance(this.logger);
    this.entityRegistry =
      dependencies?.entityRegistry ?? EntityRegistry.getInstance(this.logger);
    this.messageBus =
      dependencies?.messageBus ?? MessageBus.getInstance(this.logger);
    this.viewRegistry =
      dependencies?.viewRegistry ?? ViewRegistry.getInstance();
    this.pluginManager =
      dependencies?.pluginManager ??
      PluginManager.getInstance(this.registry, this.logger, this.messageBus);

    this.entityService =
      dependencies?.entityService ??
      EntityService.getInstance({
        db: this.db,
        embeddingService: this.embeddingService,
        entityRegistry: this.entityRegistry,
        logger: this.logger,
      });

    this.queryProcessor =
      dependencies?.queryProcessor ??
      QueryProcessor.getInstance({
        entityService: this.entityService,
        logger: this.logger,
        aiService: this.aiService,
      });

    this.contentRegistry =
      dependencies?.contentRegistry ?? ContentRegistry.getInstance();

    this.contentGenerationService =
      dependencies?.contentGenerationService ??
      ContentGenerationService.getInstance();

    // Initialize content registry with dependencies
    this.contentRegistry.initialize(this.contentGenerationService, this.logger);

    // Initialize content generation service with dependencies
    this.contentGenerationService.initialize(
      this.queryProcessor,
      this.contentRegistry,
      this.logger,
    );

    // Use injected MCP server or create one
    if (dependencies?.mcpServer) {
      this.mcpServer = dependencies.mcpServer;
    } else {
      // Create our own MCP server
      this.mcpServer = new McpServer({
        name: "brain-shell",
        version: "1.0.0",
      });
    }

    // Register shell MCP capabilities
    registerShellMCP(this.mcpServer, {
      queryProcessor: this.queryProcessor,
      entityService: this.entityService,
      contentRegistry: this.contentRegistry,
      contentGenerationService: this.contentGenerationService,
      logger: this.logger,
    });

    // Register core components in the registry
    this.registry.register("shell", () => this);
    this.registry.register("entityRegistry", () => this.entityRegistry);
    this.registry.register("messageBus", () => this.messageBus);
    this.registry.register("pluginManager", () => this.pluginManager);
    this.registry.register("entityService", () => this.entityService);
    this.registry.register("queryProcessor", () => this.queryProcessor);
    this.registry.register("aiService", () => this.aiService);
    this.registry.register(
      "contentGenerationService",
      () => this.contentGenerationService,
    );
    this.registry.register("contentRegistry", () => this.contentRegistry);
    this.registry.register("viewRegistry", () => this.viewRegistry);
    this.registry.register("mcpServer", () => this.mcpServer);

    // Listen for plugin tool registration events
    this.pluginManager.on(PluginEvent.TOOL_REGISTER, (event) => {
      const { pluginId, tool } = event;
      this.logger.debug(
        `Registering MCP tool from plugin ${pluginId}: ${tool.name}`,
      );

      // Register the tool with the MCP server
      this.mcpServer.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        async (params, extra) => {
          try {
            // Create progress context if a progress token is provided
            let progressContext;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (extra?._meta?.progressToken) {
              const progressToken = extra._meta.progressToken;
              progressContext = {
                progressToken,
                sendProgress: async (notification: {
                  progress: number;
                  total?: number;
                  message?: string;
                }): Promise<void> => {
                  await extra.sendNotification({
                    method: "notifications/progress" as const,
                    params: {
                      progressToken,
                      progress: notification.progress,
                      total: notification.total,
                      message: notification.message,
                    },
                  });
                },
              };
            }

            const result = await tool.handler(params, progressContext);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            this.logger.error(`Error in tool ${tool.name}`, error);
            throw error;
          }
        },
      );
    });

    // Listen for plugin resource registration events
    this.pluginManager.on(PluginEvent.RESOURCE_REGISTER, (event) => {
      const { pluginId, resource } = event;
      this.logger.debug(
        `Registering MCP resource from plugin ${pluginId}: ${resource.uri}`,
      );

      // Register the resource with the MCP server
      this.mcpServer.resource(resource.name, resource.uri, resource.handler);
    });
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
      // Enable WAL mode for better concurrent database access
      await enableWALMode(
        this.dbClient,
        this.config.database.url || "file:./brain.db",
        this.logger,
      );

      // Register default templates
      this.registerDefaultTemplates();

      // Register response schemas and formatters
      this.registerResponseSchemas();

      // Register base entity support
      this.registerBaseEntitySupport();

      // Register and initialize plugins if enabled
      if (this.config.features.enablePlugins) {
        this.logger.info(
          `Plugins enabled, found ${this.config.plugins.length} plugins to register`,
        );
        // Register plugins from config
        for (const plugin of this.config.plugins) {
          this.logger.info(`Registering plugin: ${plugin.id}`);
          this.pluginManager.registerPlugin(plugin);
        }

        // Initialize all registered plugins
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
   * Register default templates for shell tools
   */
  private registerDefaultTemplates(): void {
    this.logger.debug("Registering default templates");

    // Register query response template for public queries
    this.contentRegistry.registerContent("shell:query_response", {
      template: queryResponseTemplate,
      formatter: new GenericYamlFormatter<QueryResponse>(), // Use typed generic YAML formatter
      schema: queryResponseTemplate.schema,
    });

    this.logger.debug("Default templates registered");
  }

  /**
   * Register response schemas in ContentRegistry
   */
  private registerResponseSchemas(): void {
    this.logger.debug("Registering response schemas");

    // Register default query response schema
    this.contentRegistry.registerContent("shell:response:default-query", {
      template: {
        name: "shell:response:default-query",
        description: "Default query response format",
        schema: defaultQueryResponseSchema,
        basePrompt: "", // Not used for response schemas
        formatter: new DefaultYamlFormatter(), // Use YAML formatter for template
      },
      formatter: new DefaultQueryResponseFormatter(), // Response formatter for output
      schema: defaultQueryResponseSchema,
    });

    // Register simple text response
    this.contentRegistry.registerContent("shell:response:simple-text", {
      template: {
        name: "shell:response:simple-text",
        description: "Simple text response format",
        schema: simpleTextResponseSchema,
        basePrompt: "", // Not used for response schemas
        formatter: new DefaultYamlFormatter(),
      },
      formatter: new SimpleTextResponseFormatter(),
      schema: simpleTextResponseSchema,
    });

    // Register create entity response
    this.contentRegistry.registerContent("shell:response:create-entity", {
      template: {
        name: "shell:response:create-entity",
        description: "Entity creation response format",
        schema: createEntityResponseSchema,
        basePrompt: "", // Not used for response schemas
        formatter: new DefaultYamlFormatter(),
      },
      formatter: new CreateEntityResponseFormatter(),
      schema: createEntityResponseSchema,
    });

    // Register update entity response
    this.contentRegistry.registerContent("shell:response:update-entity", {
      template: {
        name: "shell:response:update-entity",
        description: "Entity update response format",
        schema: updateEntityResponseSchema,
        basePrompt: "", // Not used for response schemas
        formatter: new DefaultYamlFormatter(),
      },
      formatter: new UpdateEntityResponseFormatter(),
      schema: updateEntityResponseSchema,
    });

    // Register base entity formatter
    this.contentRegistry.registerContent("shell:formatter:base-entity", {
      template: {
        name: "shell:formatter:base-entity",
        description: "Base entity format",
        schema: baseEntitySchema,
        basePrompt: "", // Not used for response schemas
        formatter: new DefaultYamlFormatter(),
      },
      formatter: new BaseEntityFormatter(),
      schema: baseEntitySchema,
    });

    this.logger.debug("Response schemas registered");
  }

  /**
   * Register base entity support
   * This provides fallback handling for generic entities
   */
  private registerBaseEntitySupport(): void {
    this.logger.debug("Registering base entity support");

    // Create base entity adapter
    const baseEntityAdapter = new BaseEntityAdapter();

    // Register with entity registry
    this.entityRegistry.registerEntityType(
      "base",
      baseEntityAdapter.schema,
      baseEntityAdapter,
    );

    this.logger.debug("Base entity support registered");
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

  public getEntityService(): EntityService {
    return this.entityService;
  }

  public getAIService(): AIService {
    return this.aiService;
  }

  public getMcpServer(): McpServer {
    return this.mcpServer;
  }

  public getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  public getContentGenerationService(): ContentGenerationService {
    return this.contentGenerationService;
  }

  public getContentRegistry(): ContentRegistry {
    return this.contentRegistry;
  }

  public getViewRegistry(): ViewRegistry {
    return this.viewRegistry;
  }

  public getLogger(): Logger {
    return this.logger;
  }
}
