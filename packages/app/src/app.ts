import { Shell } from "@brains/shell";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
import { Logger, LogLevel } from "@brains/utils";
import type { BaseInterface, MessageContext } from "@brains/interface-core";
import {
  appConfigSchema,
  type AppConfig,
  type InterfaceConfig,
} from "./types.js";

export class App {
  private shell: Shell;
  private server: StdioMCPServer | StreamableHTTPServer | null = null;
  private interfaces: Map<string, BaseInterface> = new Map();
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

    // Add Matrix interface if --matrix flag is present
    if (
      args.includes("--matrix") &&
      !interfaces.some((i) => i.type === "matrix")
    ) {
      // Matrix interface should be configured via getMatrixInterfaceFromEnv()
      // This is handled in the app's index.ts file
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
    // Initialize shell
    await this.shell.initialize();

    // Create logger that respects log level
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
      useStderr: this.config.transport.type === "stdio", // MCP servers need stderr
    });

    // Create and configure transport server
    const mcpServer = this.shell.getMcpServer();

    if (this.config.transport.type === "stdio") {
      this.server = new StdioMCPServer({ logger });
      this.server.connectMCPServer(mcpServer);
    } else {
      this.server = new StreamableHTTPServer({
        port: this.config.transport.port,
        host: this.config.transport.host,
        logger,
      });
      this.server.connectMCPServer(mcpServer);
    }

    // Initialize interfaces
    await this.initializeInterfaces();
  }

  private async initializeInterfaces(): Promise<void> {
    // Initialize custom interfaces if provided
    if (this.config.customInterfaces) {
      for (const customInterface of this.config.customInterfaces) {
        this.interfaces.set(customInterface.name, customInterface);
      }
    }

    // Initialize configured interfaces
    for (const interfaceConfig of this.config.interfaces) {
      if (!interfaceConfig.enabled) continue;

      try {
        const interfaceInstance = await this.createInterface(interfaceConfig);
        if (interfaceInstance) {
          this.interfaces.set(interfaceConfig.type, interfaceInstance);
        }
      } catch (error) {
        const logger = this.createLogger();
        logger.error(
          `Failed to initialize ${interfaceConfig.type} interface:`,
          error,
        );
      }
    }
  }

  private async createInterface(
    config: InterfaceConfig,
  ): Promise<BaseInterface | null> {
    const logger = this.createLogger();

    const interfaceContext = {
      name: `${this.config.name}-${config.type}`,
      version: this.config.version,
      logger: logger.child(config.type),
      processQuery: async (
        query: string,
        context: MessageContext,
      ): Promise<string> => {
        // Use Shell's query method which returns DefaultQueryResponse
        const result = await this.shell.query(query, {
          userId: context.userId,
          conversationId: context.channelId, // Map channelId to conversationId
          metadata: {
            messageId: context.messageId,
            threadId: context.threadId,
            timestamp: context.timestamp.toISOString(),
          },
        });

        // Extract message from DefaultQueryResponse
        return result.message;
      },
    };

    switch (config.type) {
      case "cli": {
        const { CLIInterface } = await import("@brains/cli");
        return new CLIInterface(interfaceContext, config.config);
      }
      case "matrix": {
        const { MatrixInterface } = await import("@brains/matrix");
        return new MatrixInterface(interfaceContext, config.config);
      }
      case "webserver": {
        const { WebserverInterface } = await import("@brains/webserver");
        return new WebserverInterface(interfaceContext, config.config);
      }
      default:
        return null;
    }
  }

  private createLogger(): Logger {
    const logLevelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };
    const logLevel =
      logLevelMap[this.config.logLevel ?? "info"] ?? LogLevel.INFO;
    return Logger.createFresh({
      level: logLevel,
      context: this.config.name,
      useStderr: this.config.transport.type === "stdio",
    });
  }

  public async start(): Promise<void> {
    if (!this.server) {
      throw new Error("App not initialized. Call initialize() first.");
    }

    await this.server.start();

    // Start all interfaces
    for (const [name, interface_] of this.interfaces) {
      try {
        await interface_.start();
        const logger = this.createLogger();
        logger.info(`Started ${name} interface`);
      } catch (error) {
        const logger = this.createLogger();
        logger.error(`Failed to start ${name} interface:`, error);
      }
    }

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

    // Stop all interfaces
    for (const [name, interface_] of this.interfaces) {
      try {
        await interface_.stop();
      } catch (error) {
        const logger = this.createLogger();
        logger.error(`Failed to stop ${name} interface:`, error);
      }
    }

    if (this.server) {
      await this.server.stop();
    }
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
      useStderr: this.config.transport.type === "stdio",
    });

    try {
      logger.info(`🚀 Starting ${this.config.name} v${this.config.version}`);

      await this.initialize();
      logger.info("✅ App initialized successfully");

      await this.start();

      if (this.config.transport.type === "stdio") {
        logger.info("Brain stdio server started");
      } else {
        logger.info(
          `🌐 Brain HTTP server ready at http://${this.config.transport.host}:${this.config.transport.port}/mcp`,
        );
        logger.info(
          `   Health check: http://${this.config.transport.host}:${this.config.transport.port}/health`,
        );
        logger.info(
          `   Status: http://${this.config.transport.host}:${this.config.transport.port}/status`,
        );
      }

      // Log active interfaces
      if (this.interfaces.size > 0) {
        logger.info(
          `Active interfaces: ${Array.from(this.interfaces.keys()).join(", ")}`,
        );
      }

      // Keep process alive
      if (this.config.transport.type === "stdio") {
        // For stdio, we need to keep stdin open
        process.stdin.resume();
      }
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

  public getServer(): StdioMCPServer | StreamableHTTPServer | null {
    return this.server;
  }
}
