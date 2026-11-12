import { Shell } from "@brains/core";
import type { AppConfig, AppConfigInput } from "./types";
import { ConsoleLogger, LogLevel } from "@brains/utils/logger";
import { MigrationManager } from "./migration-manager";
import { createCliInterface } from "./cli-interface";
import {
  buildShellConfig,
  toAppConfig,
  type InitializeOptions,
} from "./shell-config";
import { Effect, Exit, Scope } from "@brains/utils/effect";
import type { Fiber } from "@brains/utils/effect";
import type { PeerChannel, RuntimeProcessRole } from "@brains/core";
import { addProcessSignalListeners } from "@brains/utils/process-signals";

export interface AppRuntimeOptions {
  migrationsCompleted?: boolean;
  processRole?: RuntimeProcessRole;
  /** The line to the runtime's other processes, when supervised. */
  peerChannel?: PeerChannel;
  onRuntimeReady?: () => void;
  /**
   * Run the terminal chat interface, as `--cli` on the command line does. A
   * caller whose command line carries no `--cli`, such as a bundled
   * `brain chat`, asks for it here.
   */
  cli?: boolean;
}

export class App {
  private shell: Shell | null = null;
  private config: AppConfig;
  private signalScope: Scope.Closeable | null = null;
  private signalShutdownFiber: Fiber.Fiber<void, never> | null = null;
  private stopPromise: Promise<void> | null = null;
  private hasCLI = false;

  public static create(config?: AppConfigInput, shell?: Shell): App {
    return new App(toAppConfig(config), shell);
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

  public async migrate(): Promise<void> {
    const logger = ConsoleLogger.getInstance();
    const migrationManager = new MigrationManager(logger);
    // Pass database URL overrides from shellConfig or simple config
    await migrationManager.runAllMigrations({
      database: this.config.shellConfig?.database?.url ?? this.config.database,
      jobQueueDatabase: this.config.shellConfig?.jobQueueDatabase?.url,
      conversationDatabase: this.config.shellConfig?.conversationDatabase?.url,
      runtimeStateDatabase: this.config.shellConfig?.runtimeStateDatabase?.url,
    });
  }

  private createShell(
    options?: InitializeOptions,
    runtimeOptions?: AppRuntimeOptions,
  ): void {
    // Let shellInitializer build the logger from shellConfig.logging so
    // logFile, format, and level take effect. ConsoleLogger.getInstance() ignores
    // options on a pre-existing singleton.
    this.shell = Shell.createFresh(
      buildShellConfig(this.config, options),
      undefined,
      {
        ...(runtimeOptions?.processRole && {
          processRole: runtimeOptions.processRole,
        }),
        ...(runtimeOptions?.peerChannel && {
          peerChannel: runtimeOptions.peerChannel,
        }),
      },
    );
  }

  private wantsCLI(runtimeOptions?: AppRuntimeOptions): boolean {
    return this.hasCLI || runtimeOptions?.cli === true;
  }

  private async registerCLIInterface(
    runtimeOptions?: AppRuntimeOptions,
  ): Promise<void> {
    if (!this.wantsCLI(runtimeOptions)) return;

    const pluginManager = this.getShell().getPluginManager();
    for (const plugin of await createCliInterface(this.config.cliConfig)) {
      pluginManager.registerPlugin(plugin);
    }
  }

  public async initialize(
    options?: InitializeOptions,
    runtimeOptions?: AppRuntimeOptions,
  ): Promise<void> {
    // A supervised child starts only after the parent has completed migrations.
    // Injected shells remain migration-free for tests and embedding applications.
    if (!this.shell) {
      if (!runtimeOptions?.migrationsCompleted) await this.migrate();
      this.createShell(options, runtimeOptions);
    }

    await this.registerCLIInterface(runtimeOptions);

    // Initialize shell (which will initialize all plugins including interfaces)
    await this.getShell().initialize(options);
  }

  public async start(): Promise<void> {
    if (this.stopPromise) return;
    this.setupSignalHandlers();
  }

  public stop(): Promise<void> {
    this.stopPromise ??= this.stopApp();
    return this.stopPromise;
  }

  private async stopApp(): Promise<void> {
    await this.closeSignalScope();
    await this.shell?.shutdown();
  }

  /**
   * Run the app - handles initialization, startup, and keeps process alive
   * This is the simplest way to start an app
   */
  public async run(runtimeOptions?: AppRuntimeOptions): Promise<void> {
    // Create logger for run output
    const logLevelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };
    const logLevel =
      logLevelMap[this.config.logLevel ?? "info"] ?? LogLevel.INFO;

    const hasCLI = this.wantsCLI(runtimeOptions);
    const logger = ConsoleLogger.createFresh({
      level: logLevel,
      context: this.config.name,
      useStderr: hasCLI, // Use stderr when CLI is active to avoid interfering with Ink UI
    });

    // Configure global logger instance to also use stderr if CLI is active
    if (hasCLI) {
      ConsoleLogger.getInstance().setUseStderr(true);
    }

    try {
      await this.initialize(undefined, runtimeOptions);
      await this.start();
      runtimeOptions?.onRuntimeReady?.();

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
    config?: AppConfigInput,
    shell?: Shell,
    runtimeOptions?: AppRuntimeOptions,
  ): Promise<void> {
    const app = App.create(config, shell);
    await app.run(runtimeOptions);
  }

  private setupSignalHandlers(): void {
    if (this.signalScope) return;

    const scope = Effect.runSync(Scope.make());
    const sigintHandler = (): void => {
      this.requestGracefulShutdown("SIGINT");
    };
    const sigtermHandler = (): void => {
      this.requestGracefulShutdown("SIGTERM");
    };

    const removeSigint = addProcessSignalListeners(["SIGINT"], sigintHandler);
    const removeSigterm = addProcessSignalListeners(
      ["SIGTERM"],
      sigtermHandler,
    );
    Effect.runSync(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          removeSigterm();
          removeSigint();
        }),
      ),
    );
    this.signalScope = scope;
  }

  private requestGracefulShutdown(signal: "SIGINT" | "SIGTERM"): void {
    if (this.signalShutdownFiber) return;

    const logger = ConsoleLogger.getInstance();
    logger.info(`\nReceived ${signal}, shutting down gracefully...`);
    const shutdown = Effect.tryPromise({
      try: () => this.stop(),
      catch: (error) => error,
    }).pipe(
      Effect.match({
        onFailure: (error) => {
          logger.error("Error during shutdown:", error);
          process.exit(1);
        },
        onSuccess: () => {
          process.exit(0);
        },
      }),
    );
    this.signalShutdownFiber = Effect.runFork(shutdown);
  }

  private async closeSignalScope(): Promise<void> {
    const scope = this.signalScope;
    this.signalScope = null;
    if (scope) await Effect.runPromise(Scope.close(scope, Exit.void));
  }

  public getShell(): Shell {
    if (!this.shell) {
      throw new Error("Shell not initialized. Call initialize() first.");
    }
    return this.shell;
  }
}
