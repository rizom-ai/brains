import { Shell } from "@brains/core";
import { type AppConfig, type AppConfigInput, appConfigSchema } from "./types";
import { ConsoleLogger, LogLevel } from "@brains/utils/logger";
import { MigrationManager } from "./migration-manager";
import { preferLocalUrlsForRuntime } from "./runtime-env";
import {
  resolveGitBrokerCheckout,
  resolveGitBrokerSocket,
  resolveStandardConfig,
} from "./standard-paths";
import { Effect, Exit, Scope } from "@brains/utils/effect";
import type { Fiber } from "@brains/utils/effect";
import type {
  LocalDatabaseEndpointConfig,
  RuntimeProcessRole,
} from "@brains/core";
import { addProcessSignalListeners } from "@brains/utils/process-signals";

export type ShellConfig = NonNullable<Parameters<typeof Shell.createFresh>[0]>;
export type InitializeOptions = Parameters<Shell["initialize"]>[0];

export interface AppRuntimeOptions {
  migrationsCompleted?: boolean;
  processRole?: RuntimeProcessRole;
  localDatabaseEndpoint?: LocalDatabaseEndpointConfig;
  onRuntimeReady?: () => void;
}

/**
 * Sentinel API key injected when `--startup-check` runs without a real key
 * configured. Lets the AI client construct without paging the operator for
 * credentials; the smoke path exits before any real request is issued.
 */
export const STARTUP_CHECK_API_KEY = "startup-check";

/**
 * The plain AppConfig an App runs with, from what a caller passed in.
 *
 * Validates the schema, then attaches the parts the schema does not carry —
 * the Plugin objects and the caller-supplied blocks. Exported so tests of
 * config policy can build a real AppConfig without constructing an App.
 */
export function toAppConfig(config?: AppConfigInput): AppConfig {
  const validatedConfig = appConfigSchema.parse(config ?? {});

  // Follow Shell's pattern: validate schema then add full Plugin objects
  const appConfig: AppConfig = {
    ...validatedConfig,
    plugins: config?.plugins ?? [],
  };

  // Only add optional properties if they're defined
  if (config?.permissions) appConfig.permissions = config.permissions;
  if (config?.spaces) appConfig.spaces = config.spaces;
  if (config?.cliConfig) appConfig.cliConfig = config.cliConfig;
  if (config?.shellConfig) appConfig.shellConfig = config.shellConfig;
  return appConfig;
}

/**
 * The ShellConfig an App hands to Shell.createFresh.
 *
 * A pure function of the AppConfig and the initialize options — no App
 * instance, no Shell. Tests of config policy assert on the returned object
 * instead of spying Shell.createFresh to capture what App passed it.
 */
export function buildShellConfig(
  config: AppConfig,
  options?: InitializeOptions,
): ShellConfig {
  const shellConfig: ShellConfig = {
    plugins: config.plugins ?? [],
    ...config.shellConfig, // Allow overriding for tests/advanced use
  };

  applyStandardStorageConfig(shellConfig);
  applySimpleConfigOverrides(config, shellConfig);
  applyAIConfig(config, shellConfig, options);
  applyLoggingConfig(config, shellConfig);
  applyPermissionConfig(config, shellConfig);
  applySpacesConfig(config, shellConfig);
  applyIdentityConfig(config, shellConfig);
  applyAgentInstructions(config, shellConfig);
  applyAppMetadata(config, shellConfig);

  return shellConfig;
}

/**
 * Environment policy lives here, not in core: resolve XDG-based storage
 * paths and pass them as explicit config. Anything the caller already
 * set (tests, advanced use) wins.
 */
function applyStandardStorageConfig(shellConfig: ShellConfig): void {
  const standard = resolveStandardConfig();
  shellConfig.database ??= standard.database;
  shellConfig.jobQueueDatabase ??= standard.jobQueueDatabase;
  shellConfig.conversationDatabase ??= standard.conversationDatabase;
  shellConfig.runtimeStateDatabase ??= standard.runtimeStateDatabase;
  shellConfig.embedding ??= standard.embedding;
  shellConfig.gitBrokerSocket ??= resolveGitBrokerSocket();
  shellConfig.gitBrokerCheckout ??= resolveGitBrokerCheckout();
}

function applySimpleConfigOverrides(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  // Apply simple app config (these override shellConfig if both are provided)
  if (config.database) {
    shellConfig.database = { url: config.database };
  }
  if (config.profileKind) {
    shellConfig.profileKind = config.profileKind;
  }

  // Set feature flags (none currently)
  shellConfig.features = {};
}

function applyAIConfig(
  config: AppConfig,
  shellConfig: ShellConfig,
  options?: InitializeOptions,
): void {
  const isStartupCheck = options?.mode === "startup-check";
  if (
    !config.aiApiKey &&
    !config.aiImageKey &&
    !config.aiModel &&
    !config.aiReasoningEffort &&
    !isStartupCheck
  ) {
    return;
  }

  shellConfig.ai = {
    ...shellConfig.ai,
    ...(isStartupCheck &&
      !shellConfig.ai?.apiKey && { apiKey: STARTUP_CHECK_API_KEY }),
    ...(config.aiApiKey && { apiKey: config.aiApiKey }),
    ...(config.aiImageKey && {
      imageApiKey: config.aiImageKey,
    }),
    ...(config.aiModel && { model: config.aiModel }),
    ...(config.aiReasoningEffort && {
      reasoningEffort: config.aiReasoningEffort,
    }),
  };
}

function applyLoggingConfig(config: AppConfig, shellConfig: ShellConfig): void {
  if (!config.logLevel && !config.logFile) return;

  shellConfig.logging = {
    level: config.logLevel ?? "info",
    format: "text",
    context: config.name,
    ...(config.logFile && { file: config.logFile }),
  };
}

function applyPermissionConfig(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  if (config.permissions) {
    shellConfig.permissions = config.permissions;
  }
}

function applySpacesConfig(config: AppConfig, shellConfig: ShellConfig): void {
  if (config.spaces) {
    shellConfig.spaces = config.spaces;
  }
}

function applyIdentityConfig(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  if (config.identity) {
    shellConfig.identity = config.identity;
  }
}

function applyAgentInstructions(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  if (config.agentInstructions) {
    shellConfig.agentInstructions = config.agentInstructions;
  }
}

function applyAppMetadata(config: AppConfig, shellConfig: ShellConfig): void {
  shellConfig.name = config.name;
  shellConfig.version = config.version;

  // Set site base URL from deployment domain for entity link generation
  if (config.deployment.domain) {
    shellConfig.siteBaseUrl = config.deployment.domain;
  }

  shellConfig.localSiteUrl = `http://localhost:${config.deployment.ports.production}`;
  shellConfig.preferLocalUrls = preferLocalUrlsForRuntime();
}

export class App {
  private shell: Shell | null = null;
  private config: AppConfig;
  private signalScope: Scope.CloseableScope | null = null;
  private signalShutdownFiber: Fiber.RuntimeFiber<void, never> | null = null;
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
        ...(runtimeOptions?.localDatabaseEndpoint && {
          localDatabaseEndpoint: runtimeOptions.localDatabaseEndpoint,
        }),
      },
    );
  }

  private async registerCLIInterface(): Promise<void> {
    if (!this.hasCLI) return;

    const pluginManager = this.getShell().getPluginManager();
    const { CLIInterface } = await import("@brains/chat-repl");
    const plugin = new CLIInterface(this.config.cliConfig);
    pluginManager.registerPlugin(plugin);
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

    await this.registerCLIInterface();

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

    const logger = ConsoleLogger.createFresh({
      level: logLevel,
      context: this.config.name,
      useStderr: this.hasCLI, // Use stderr when CLI is active to avoid interfering with Ink UI
    });

    // Configure global logger instance to also use stderr if CLI is active
    if (this.hasCLI) {
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
