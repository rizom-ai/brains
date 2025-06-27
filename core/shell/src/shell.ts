import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import { createDatabase, enableWALMode } from "@brains/db";
import { ServiceRegistry } from "@brains/service-registry";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { MessageBus } from "@brains/messaging-service";
import { PluginManager, PluginEvent } from "./plugins/pluginManager";
import {
  EmbeddingService,
  type IEmbeddingService,
} from "@brains/embedding-service";
import { ContentGenerator } from "@brains/content-generator";
import { AIService } from "@brains/ai-service";
import { Logger, LogLevel } from "@brains/utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerShellMCP } from "./mcp";
import type { Plugin, RouteDefinition, Template } from "@brains/types";
import { type DefaultQueryResponse } from "@brains/types";
import { knowledgeQueryTemplate } from "./templates";
import type { ShellConfig } from "./config";
import { createShellConfig } from "./config";
import { ViewRegistry } from "@brains/view-registry";
import { BaseEntityAdapter } from "@brains/base-entity";

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

    // Register shell MCP capabilities
    registerShellMCP(this.mcpServer, {
      contentGenerator: this.contentGenerator,
      entityService: this.entityService,
      logger: this.logger,
    });

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

      // Register system templates
      this.registerShellTemplates();

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
   * Register shell's own system templates
   */
  private registerShellTemplates(): void {
    // Register knowledge query template for shell queries
    this.contentGenerator.registerTemplate(
      knowledgeQueryTemplate.name,
      knowledgeQueryTemplate,
    );

    this.logger.debug("Shell system templates registered");
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
      throw new Error("Shell not initialized");
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
