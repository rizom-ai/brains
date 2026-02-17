import { Shell } from "@brains/core";
import { Logger, LogLevel } from "@brains/utils";
import { appConfigSchema, type AppConfig } from "./types";
import { MigrationManager } from "./migration-manager";

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
    // Pass database URL overrides from shellConfig or simple config
    await migrationManager.runAllMigrations({
      database: this.config.shellConfig?.database?.url ?? this.config.database,
      jobQueueDatabase: this.config.shellConfig?.jobQueueDatabase?.url,
      conversationDatabase: this.config.shellConfig?.conversationDatabase?.url,
    });
  }

  public async initialize(): Promise<void> {
    // Only run migrations when we're creating a shell (not when using mock shell for tests)
    if (!this.shell) {
      await this.runMigrations();
    }

    // Create shell if not provided in constructor
    if (!this.shell) {
      const shellConfig: Parameters<typeof Shell.createFresh>[0] = {
        plugins: this.config.plugins ?? [],
        ...this.config.shellConfig, // Allow overriding for tests/advanced use
      };

      // Apply simple app config (these override shellConfig if both are provided)
      if (this.config.database) {
        shellConfig.database = { url: this.config.database };
      }

      // Set feature flags (none currently)
      shellConfig.features = {};

      if (
        this.config.aiApiKey ||
        this.config.openaiApiKey ||
        this.config.googleApiKey
      ) {
        shellConfig.ai = {
          ...shellConfig.ai,
          ...(this.config.aiApiKey && {
            apiKey: this.config.aiApiKey,
            provider: "anthropic" as const,
          }),
          ...(this.config.openaiApiKey && {
            openaiApiKey: this.config.openaiApiKey,
          }),
          ...(this.config.googleApiKey && {
            googleApiKey: this.config.googleApiKey,
          }),
        };
      }

      if (this.config.logLevel) {
        shellConfig.logging = {
          level: this.config.logLevel,
          context: this.config.name,
        };
      }

      if (this.config.permissions) {
        shellConfig.permissions = this.config.permissions;
      }

      if (this.config.identity) {
        shellConfig.identity = this.config.identity;
      }

      // Set app name and version
      shellConfig.name = this.config.name;
      shellConfig.version = this.config.version;

      // Set site base URL from deployment domain for entity link generation
      if (this.config.deployment?.domain) {
        shellConfig.siteBaseUrl = this.config.deployment.domain;
      }

      // Pass the global logger instance which has already been configured
      // In CLI mode, it's already set to use stderr in run()
      this.shell = Shell.createFresh(shellConfig, {
        logger: Logger.getInstance(),
      });
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
      const logger = Logger.getInstance();
      logger.info(`\nReceived ${signal}, shutting down gracefully...`);

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown:", error);
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
