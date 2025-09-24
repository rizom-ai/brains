import { Shell, type ShellDependencies } from "@brains/core";
import { Logger, LogLevel } from "@brains/utils";
import { appConfigSchema, type AppConfig } from "./types";
import { SeedDataManager } from "./seed-data-manager";
import { MigrationManager } from "./migration-manager";
import { ShellInitializer } from "./shellInitializer";

export class App {
  private shell: Shell | null = null;
  private config: AppConfig;
  private shutdownHandlers: Array<() => void> = [];
  private isShuttingDown = false;
  private hasCLI = false;

  public static create(config?: Partial<AppConfig>, shell?: Shell): App {
    const validatedConfig = appConfigSchema.parse(config ?? {});

    // Follow Shell's pattern: validate schema then add full Plugin objects
    const appConfig: AppConfig = {
      ...validatedConfig,
      plugins: config?.plugins ?? [],
    };

    // Only add optional properties if they're defined
    if (config?.permissions) appConfig.permissions = config.permissions;
    if (config?.cliConfig) appConfig.cliConfig = config.cliConfig;
    if (config?.shellConfig) appConfig.shellConfig = config.shellConfig;
    return new App(appConfig, shell);
  }

  private constructor(config: AppConfig, shell?: Shell) {
    this.config = config;
    // Check if --cli flag is present
    this.hasCLI = process.argv.slice(2).includes("--cli");

    // Store the shell if provided, otherwise we'll create it in initialize()
    if (shell) {
      this.shell = shell;
    }
  }

  private async runMigrations(): Promise<void> {
    const logger = Logger.getInstance();
    const migrationManager = new MigrationManager(logger);
    await migrationManager.runAllMigrations();
  }

  private async initializeSeedData(): Promise<void> {
    const logger = Logger.getInstance();
    const seedDataManager = new SeedDataManager(logger);
    await seedDataManager.initialize();
  }

  public async initialize(): Promise<void> {
    // Run migrations before creating shell
    await this.runMigrations();

    // Initialize seed data if needed
    await this.initializeSeedData();

    // Create shell if not provided in constructor
    if (!this.shell) {
      // Build shell config from app config
      const shellConfig = {
        plugins: this.config.plugins ?? [],
        database: { url: this.config.database ?? "file:./data/brain.db" },
        conversationDatabase: { url: this.config.database ?? "file:./data/conversations.db" },
        jobQueueDatabase: { url: this.config.database ?? "file:./data/brain-jobs.db" },
        features: {},
        ai: this.config.aiApiKey ? {
          apiKey: this.config.aiApiKey,
          provider: "anthropic" as const,
          model: "claude-3-haiku-20240307",
          temperature: 0.7,
          maxTokens: 1000,
          webSearch: false,
        } : {
          apiKey: "fake-key",
          provider: "anthropic" as const,
          model: "claude-3-haiku-20240307",
          temperature: 0.7,
          maxTokens: 1000,
          webSearch: false,
        },
        logging: {
          level: this.config.logLevel ?? "info",
          context: this.config.name,
        },
        permissions: this.config.permissions ?? {},
        embedding: {
          model: "fast-all-MiniLM-L6-v2" as const,
          cacheDir: "./cache/embeddings"
        },
        ...this.config.shellConfig, // Allow overriding for tests/advanced use
      };

      // Create logger
      const logger = Logger.createFresh({
        level: {
          debug: LogLevel.DEBUG,
          info: LogLevel.INFO,
          warn: LogLevel.WARN,
          error: LogLevel.ERROR,
        }[shellConfig.logging.level],
        context: shellConfig.logging.context,
      });

      // Initialize services using ShellInitializer
      const shellInitializer = ShellInitializer.getInstance(logger, shellConfig);
      const services = shellInitializer.initializeServices();

      // Create shell with all services as dependencies
      // Cast to ShellDependencies since Shell expects interface types but we have concrete implementations
      const shellDependencies: ShellDependencies = {
        logger: services.logger,
        serviceRegistry: services.serviceRegistry,
        entityRegistry: services.entityRegistry,
        messageBus: services.messageBus,
        renderService: services.renderService,
        daemonRegistry: services.daemonRegistry,
        pluginManager: services.pluginManager,
        commandRegistry: services.commandRegistry,
        templateRegistry: services.templateRegistry,
        dataSourceRegistry: services.dataSourceRegistry,
        mcpService: services.mcpService,
        embeddingService: services.embeddingService,
        entityService: services.entityService,
        aiService: services.aiService,
        conversationService: services.conversationService,
        contentService: services.contentService,
        jobQueueService: services.jobQueueService,
        jobQueueWorker: services.jobQueueWorker,
        batchJobManager: services.batchJobManager,
        jobProgressMonitor: services.jobProgressMonitor,
        permissionService: services.permissionService,
      };

      this.shell = Shell.createFresh(shellDependencies, shellConfig);

      // Register services in the service registry
      shellInitializer.registerServices(services, this.shell);

      // Complete initialization (templates, plugins, etc.)
      await shellInitializer.initializeAll(
        services.templateRegistry,
        services.entityRegistry,
        services.pluginManager,
      );
    }

    // Register CLI interface if --cli flag is present
    if (this.hasCLI) {
      const pluginManager = this.getShell().getPluginManager();
      const { CLIInterface } = await import("@brains/cli");
      const plugin = new CLIInterface(this.config.cliConfig);
      pluginManager.registerPlugin(plugin);
    }

    // Initialize shell (which will initialize all plugins including interfaces)
    await this.getShell().initialize();
  }

  public async start(): Promise<void> {
    // Set up signal handlers
    this.setupSignalHandlers();
  }

  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }

    this.isShuttingDown = true;

    // Remove signal handlers
    this.cleanupSignalHandlers();

    // Interfaces are stopped as plugins during shell shutdown
  }

  /**
   * Run the app - handles initialization, startup, and keeps process alive
   * This is the simplest way to start an app
   */
  public async run(): Promise<void> {
    // Create logger for run output
    const logLevelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };
    const logLevel =
      logLevelMap[this.config.logLevel ?? "info"] ?? LogLevel.INFO;

    const logger = Logger.createFresh({
      level: logLevel,
      context: this.config.name,
      useStderr: this.hasCLI, // Use stderr when CLI is active to avoid interfering with Ink UI
    });

    // Configure global logger instance to also use stderr if CLI is active
    if (this.hasCLI) {
      Logger.getInstance().setUseStderr(true);
    }

    try {
      await this.initialize();
      await this.start();

      logger.info(`✅ ${this.config.name} v${this.config.version} ready`);

      // Keep process alive
      process.stdin.resume();
    } catch (error) {
      logger.error(`❌ Failed to start ${this.config.name}:`, error);
      process.exit(1);
    }
  }

  /**
   * Static convenience method to create and run an app in one call
   */
  public static async run(
    config?: Partial<AppConfig>,
    shell?: Shell,
  ): Promise<void> {
    const app = App.create(config, shell);
    await app.run();
  }

  private setupSignalHandlers(): void {
    const gracefulShutdown = async (signal: string): Promise<void> => {
      // Use stderr if CLI is active to avoid interfering with Ink UI
      if (this.hasCLI) {
        console.error(`\nReceived ${signal}, shutting down gracefully...`);
      } else {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
      }

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
      }
    };

    const sigintHandler = (): void => {
      void gracefulShutdown("SIGINT");
    };
    const sigtermHandler = (): void => {
      void gracefulShutdown("SIGTERM");
    };

    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);

    // Store handlers so we can remove them later
    this.shutdownHandlers.push(
      () => process.removeListener("SIGINT", sigintHandler),
      () => process.removeListener("SIGTERM", sigtermHandler),
    );
  }

  private cleanupSignalHandlers(): void {
    for (const cleanup of this.shutdownHandlers) {
      cleanup();
    }
    this.shutdownHandlers = [];
  }

  public getShell(): Shell {
    if (!this.shell) {
      throw new Error("Shell not initialized. Call initialize() first.");
    }
    return this.shell;
  }
}
