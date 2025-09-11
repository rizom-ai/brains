import { Shell, getStandardConfigWithDirectories } from "@brains/core";
import { Logger, LogLevel } from "@brains/utils";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue";
import { migrateConversations } from "@brains/conversation-service";
import { appConfigSchema, type AppConfig } from "./types";
import * as fs from "fs/promises";
import * as path from "path";

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
    logger.info("Running database migrations...");

    try {
      const config = await getStandardConfigWithDirectories();

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
      // Log but don't fail - databases might already be migrated
      logger.warn(
        "Migration failed (databases may already be migrated):",
        error,
      );
    }
  }

  private async initializeSeedData(): Promise<void> {
    const logger = Logger.getInstance();
    // brain-data and seed-content are always in the current working directory
    const brainDataDir = path.resolve(process.cwd(), "brain-data");
    const seedContentDir = path.resolve(process.cwd(), "seed-content");

    try {
      logger.debug(`Checking brain-data at: ${brainDataDir}`);
      logger.debug(`Looking for seed-content at: ${seedContentDir}`);

      // Check if brain-data directory exists and is empty
      let isEmpty = false;
      try {
        const files = await fs.readdir(brainDataDir);
        isEmpty = files.length === 0;
        logger.debug(`brain-data exists with ${files.length} files`);
      } catch {
        // Directory doesn't exist
        logger.debug("brain-data directory doesn't exist, creating it");
        isEmpty = true;
        await fs.mkdir(brainDataDir, { recursive: true });
      }

      if (isEmpty) {
        // Check if seed-content exists
        try {
          await fs.access(seedContentDir);
          logger.info(`Initializing brain-data with seed content...`);

          // Copy seed content to brain-data
          await this.copyDirectory(seedContentDir, brainDataDir);

          logger.info("✅ Seed content copied successfully");
        } catch {
          // No seed content available, that's okay
          logger.info(
            "No seed-content directory found, starting with empty brain-data",
          );
        }
      } else {
        logger.info(
          "brain-data directory not empty, skipping seed content initialization",
        );
      }
    } catch (error) {
      logger.warn("Failed to initialize seed data:", error);
      // Don't fail the app startup for this
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  public async initialize(): Promise<void> {
    console.log("🔧 App.initialize() called - running migrations...");
    // Run migrations before creating shell
    await this.runMigrations();

    // Initialize seed data if needed
    await this.initializeSeedData();

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

      if (this.config.aiApiKey) {
        shellConfig.ai = {
          apiKey: this.config.aiApiKey,
          provider: "anthropic",
          model: "claude-3-haiku-20240307",
          temperature: 0.7,
          maxTokens: 1000,
          webSearch: false,
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

      this.shell = Shell.createFresh(shellConfig);
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
    if (!this.shell) {
      throw new Error("Shell not initialized. Call initialize() first.");
    }
    return this.shell;
  }
}
