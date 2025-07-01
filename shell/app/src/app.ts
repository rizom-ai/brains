import { Shell } from "@brains/core";
import { Logger, LogLevel } from "@brains/utils";
import { appConfigSchema, type AppConfig } from "./types.js";

export class App {
  private shell: Shell;
  private config: AppConfig;
  private shutdownHandlers: Array<() => void> = [];
  private isShuttingDown = false;

  public static create(config?: Partial<AppConfig>, shell?: Shell): App {
    const validatedConfig = appConfigSchema.parse(config ?? {});

    // Parse command line arguments for interface selection
    const args = process.argv.slice(2);
    const interfaces = [...validatedConfig.interfaces];

    // Add CLI interface if --cli flag is present
    if (args.includes("--cli") && !interfaces.some((i) => i.type === "cli")) {
      interfaces.push({
        type: "cli",
        enabled: true,
        config: config?.cliConfig,
      });
    }

    // Follow Shell's pattern: validate schema then add full Plugin objects
    const appConfig: AppConfig = {
      ...validatedConfig,
      interfaces,
      plugins: config?.plugins ?? [],
    };
    return new App(appConfig, shell);
  }

  private constructor(config: AppConfig, shell?: Shell) {
    this.config = config;

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

      // Set feature flags
      shellConfig.features = {
        enablePlugins: true,
      };

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

      this.shell = Shell.createFresh(shellConfig);
    }
  }

  public async initialize(): Promise<void> {
    // Register CLI interface if --cli flag is present
    await this.registerCLIIfRequested();

    // Initialize shell (which will initialize all plugins including interfaces)
    await this.shell.initialize();
  }

  private async registerCLIIfRequested(): Promise<void> {
    // Check if CLI interface was added via --cli flag
    const cliInterface = this.config.interfaces.find(
      (i) => i.type === "cli" && i.enabled,
    );
    if (!cliInterface) return;

    const pluginManager = this.shell.getPluginManager();
    const { CLIInterface } = await import("@brains/cli");
    const plugin = new CLIInterface(cliInterface.config);
    pluginManager.registerPlugin(plugin);
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
    });

    try {
      logger.info(`🚀 Starting ${this.config.name} v${this.config.version}`);

      await this.initialize();
      logger.info("✅ App initialized successfully");

      await this.start();

      // Interfaces are now logged as plugins during shell initialization

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
      console.log(`\nReceived ${signal}, shutting down gracefully...`);

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
}
