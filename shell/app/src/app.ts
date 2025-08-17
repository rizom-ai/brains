import { Shell } from "@brains/core";
import { Logger, LogLevel } from "@brains/utils";
import { appConfigSchema, type AppConfig } from "./types";

export class App {
  private shell: Shell;
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

    if (shell) {
      this.shell = shell;
    } else {
      // Build shell config from app config
      const shellConfig: Parameters<typeof Shell.createFresh>[0] = {
        plugins: config.plugins ?? [],
        ...config.shellConfig, // Allow overriding for tests/advanced use
      };

      // Apply simple app config (these override shellConfig if both are provided)
      if (config.database) {
        shellConfig.database = { url: config.database };
      }

      // Set feature flags (none currently)
      shellConfig.features = {};

      if (config.aiApiKey) {
        shellConfig.ai = {
          apiKey: config.aiApiKey,
          provider: "anthropic",
          model: "claude-3-haiku-20240307",
          temperature: 0.7,
          maxTokens: 1000,
        };
      }

      if (config.logLevel) {
        shellConfig.logging = { level: config.logLevel, context: config.name };
      }

      if (config.permissions) {
        shellConfig.permissions = config.permissions;
      }

      this.shell = Shell.createFresh(shellConfig);
    }
  }

  public async initialize(): Promise<void> {
    // Register CLI interface if --cli flag is present
    if (this.hasCLI) {
      const pluginManager = this.shell.getPluginManager();
      const { CLIInterface } = await import("@brains/cli");
      const plugin = new CLIInterface(this.config.cliConfig);
      pluginManager.registerPlugin(plugin);
    }

    // Initialize shell (which will initialize all plugins including interfaces)
    await this.shell.initialize();
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
      logger.info(`🚀 Starting ${this.config.name} v${this.config.version}`);

      await this.initialize();
      logger.info("✅ App initialized successfully");

      await this.start();

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
    return this.shell;
  }

  /**
   * Run database migrations for all shell services
   * This centralizes migration logic that was previously duplicated in app scripts
   */
  public static async migrate(): Promise<void> {
    const { getStandardConfigWithDirectories } = await import("@brains/core");
    const { migrateEntities } = await import("@brains/entity-service/migrate");
    const { migrateJobQueue } = await import("@brains/job-queue");
    const { migrateConversations } = await import(
      "@brains/conversation-service"
    );
    const { Logger } = await import("@brains/utils");

    // Get standard configuration and ensure directories exist
    const config = await getStandardConfigWithDirectories();
    const logger = Logger.getInstance();

    logger.info("Running database migrations...");

    try {
      // Run all migrations in sequence
      logger.info("Running entity database migrations...");
      await migrateEntities(
        {
          url: config.database.url,
          ...(config.database.authToken && {
            authToken: config.database.authToken,
          }),
        },
        logger,
      );

      logger.info("Running job queue database migrations...");
      await migrateJobQueue(
        {
          url: config.jobQueueDatabase.url,
          ...(config.jobQueueDatabase.authToken && {
            authToken: config.jobQueueDatabase.authToken,
          }),
        },
        logger,
      );

      logger.info("Running conversation database migrations...");
      await migrateConversations(
        {
          url: config.conversationDatabase.url,
          ...(config.conversationDatabase.authToken && {
            authToken: config.conversationDatabase.authToken,
          }),
        },
        logger,
      );

      logger.info("✅ All database migrations completed successfully");
    } catch (error) {
      logger.error("❌ Migration failed:", error);
      throw error;
    }
  }
}
