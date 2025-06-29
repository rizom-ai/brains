import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import { createDatabase } from "@brains/db";
import { ServiceRegistry } from "@brains/service-registry";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";
import { PluginManager } from "./plugins/pluginManager";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "@brains/embedding-service";
import { ContentGenerator } from "@brains/content-generator";
import { AIService } from "@brains/ai-service";
import { Logger, LogLevel } from "@brains/utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Plugin, Template } from "@brains/types";
import type { RouteDefinition } from "@brains/view-registry";
import { type DefaultQueryResponse } from "@brains/types";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";
import { ViewRegistry } from "@brains/view-registry";
import { ShellInitializer } from "./initialization/shellInitializer";
import { McpServerManager } from "./mcp/mcpServerManager";
import { InitializationError } from "@brains/utils";

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
  serviceRegistry?: ServiceRegistry;
  entityRegistry?: EntityRegistry;
  messageBus?: MessageBus;
  viewRegistry?: ViewRegistry;
  pluginManager?: PluginManager;
  contentGenerator?: ContentGenerator;
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
  private readonly serviceRegistry: ServiceRegistry;
  private readonly entityRegistry: EntityRegistry;
  private readonly messageBus: MessageBus;
  private readonly pluginManager: PluginManager;
  private readonly viewRegistry: ViewRegistry;
  private readonly embeddingService: IEmbeddingService;
  private readonly entityService: EntityService;
  private readonly aiService: AIService;
  private readonly contentGenerator: ContentGenerator;
  private readonly mcpServer: McpServer;
  private initialized = false;

  /**
   * Get the singleton instance of Shell
   */
  public static getInstance(config?: Partial<ShellConfig>): Shell {
    Shell.instance ??= new Shell(createShellConfig(config));
    return Shell.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static async resetInstance(): Promise<void> {
    if (Shell.instance) {
      await Shell.instance.shutdown();
      Shell.instance = null;
    }
    // Also reset dependent singletons
    ShellInitializer.resetInstance();
    McpServerManager.resetInstance();
  }

  /**
   * Create a fresh instance without affecting the singleton
   * @param config - Configuration for the shell
   * @param dependencies - Optional dependencies for testing
   */
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

    const serviceRegistry = ServiceRegistry.createFresh(logger);
    const entityRegistry = EntityRegistry.createFresh(logger);
    const messageBus = MessageBus.createFresh(logger);
    const pluginManager = PluginManager.createFresh(serviceRegistry, logger);

    // Merge fresh instances with any provided dependencies (without contentGenerator yet)
    const freshDependencies: ShellDependencies = {
      ...dependencies,
      logger,
      serviceRegistry,
      entityRegistry,
      messageBus,
      pluginManager,
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
    this.serviceRegistry =
      dependencies?.serviceRegistry ?? ServiceRegistry.getInstance(this.logger);
    this.entityRegistry =
      dependencies?.entityRegistry ?? EntityRegistry.getInstance(this.logger);
    this.messageBus =
      dependencies?.messageBus ?? MessageBus.getInstance(this.logger);
    this.viewRegistry =
      dependencies?.viewRegistry ?? ViewRegistry.getInstance();
    this.pluginManager =
      dependencies?.pluginManager ??
      PluginManager.getInstance(this.serviceRegistry, this.logger);

    this.entityService =
      dependencies?.entityService ??
      EntityService.getInstance({
        db: this.db,
        embeddingService: this.embeddingService,
        entityRegistry: this.entityRegistry,
        logger: this.logger,
      });

    this.contentGenerator =
      dependencies?.contentGenerator ??
      ContentGenerator.getInstance({
        logger: this.logger,
        entityService: this.entityService,
        aiService: this.aiService,
      });

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

    // Set up MCP server with Shell capabilities and plugin event listeners
    // Use createFresh for dependency injection to avoid singleton issues in tests
    const mcpServerManager = dependencies?.mcpServer
      ? McpServerManager.createFresh(this.logger, this.mcpServer)
      : McpServerManager.getInstance(this.logger, this.mcpServer);
    mcpServerManager.initializeShellCapabilities(
      this.contentGenerator,
      this.entityService,
    );
    mcpServerManager.setupPluginEventListeners(this.pluginManager);

    // Register core components in the service registry
    this.serviceRegistry.register("shell", () => this);
    this.serviceRegistry.register("entityRegistry", () => this.entityRegistry);
    this.serviceRegistry.register("messageBus", () => this.messageBus);
    this.serviceRegistry.register("pluginManager", () => this.pluginManager);
    this.serviceRegistry.register("entityService", () => this.entityService);
    this.serviceRegistry.register("aiService", () => this.aiService);
    this.serviceRegistry.register(
      "contentGenerator",
      () => this.contentGenerator,
    );
    this.serviceRegistry.register("viewRegistry", () => this.viewRegistry);
    this.serviceRegistry.register("mcpServer", () => this.mcpServer);
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
      const shellInitializer = ShellInitializer.getInstance(
        this.logger,
        this.config,
        this.dbClient,
      );

      await shellInitializer.initializeAll(
        this.contentGenerator,
        this.entityRegistry,
        this.pluginManager,
      );

      this.initialized = true;
      this.logger.info("Shell initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Shell", error);
      throw error;
    }
  }

  /**
   * Register templates from plugins
   */
  public registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void {
    this.logger.debug("Registering templates", { pluginId });

    // Register templates from plugins
    // Note: template names are already prefixed by PluginManager

    Object.values(templates).forEach((template: Template) => {
      // Register with ContentGenerator (for AI generation)
      this.contentGenerator.registerTemplate(template.name, template);

      // Register with ViewRegistry (for rendering) if it has a layout component
      if (template.layout?.component) {
        this.viewRegistry.registerViewTemplate({
          name: template.name, // Already prefixed
          schema: template.schema,
          description: template.description,
          pluginId: pluginId ?? "shell", // Default to shell if no pluginId
          renderers: { web: template.layout.component },
          interactive: template.layout.interactive ?? false,
        });
      }
    });

    this.logger.debug(`Registered ${Object.keys(templates).length} templates`, {
      pluginId,
    });
  }

  /**
   * Register a unified template for both content generation and view rendering
   */
  public registerTemplate<T>(name: string, template: Template<T>): void {
    this.logger.debug("Registering unified template", { name });

    // Register with ContentGenerator for content generation
    this.contentGenerator.registerTemplate(name, template);

    // Register with ViewRegistry for rendering if layout is provided
    if (template.layout?.component) {
      this.viewRegistry.registerTemplate(name, template);
    }

    this.logger.debug(`Registered unified template: ${name}`);
  }

  /**
   * Register routes (typically called by plugins)
   */
  public registerRoutes(
    routes: RouteDefinition[],
    options?: {
      pluginId?: string;
      environment?: string;
    },
  ): void {
    const { pluginId } = options ?? {};
    this.logger.debug("Registering routes", { pluginId, count: routes.length });

    routes.forEach((route) => {
      // Add convention-based contentEntity if not already present
      const processedRoute = {
        ...route,
        pluginId,
        sections: route.sections.map((section) => ({
          ...section,
          contentEntity: section.contentEntity ?? {
            entityType: "site-content-preview",
            query: {
              page: route.id,
              section: section.id,
            },
          },
        })),
      };

      this.viewRegistry.registerRoute(processedRoute);
    });

    this.logger.debug(`Registered ${routes.length} routes`, { pluginId });
  }

  /**
   * Shutdown the Shell and clean up resources
   */
  public async shutdown(): Promise<void> {
    this.logger.info("Shutting down Shell");

    // Cleanup in reverse order of initialization
    // Disable all plugins
    for (const [pluginId] of this.pluginManager.getAllPlugins()) {
      await this.pluginManager.disablePlugin(pluginId);
    }

    // Clear registries
    this.serviceRegistry.clear();

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
  ): Promise<DefaultQueryResponse> {
    if (!this.initialized) {
      throw new InitializationError(
        "Shell",
        "Query attempted before initialization",
        {
          operation: "query",
        },
      );
    }

    // Use ContentGenerator with knowledge query template
    const context = {
      prompt: query,
      data: {
        userId: options?.userId,
        conversationId: options?.conversationId,
        ...options?.metadata,
      },
    };

    return this.contentGenerator.generateContent(
      "shell:knowledge-query",
      context,
    );
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: Plugin): void {
    if (!this.initialized) {
      throw new InitializationError(
        "Shell",
        "Plugin registration attempted before initialization",
        {
          operation: "registerPlugin",
          pluginId: plugin.id,
        },
      );
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

  public getContentGenerator(): ContentGenerator {
    return this.contentGenerator;
  }

  public getViewRegistry(): ViewRegistry {
    return this.viewRegistry;
  }

  public getMessageBus(): MessageBus {
    return this.messageBus;
  }

  public getLogger(): Logger {
    return this.logger;
  }
}
