import { materializePrompts, SYSTEM_CHANNELS } from "@brains/plugins";
import type { ShellConfig } from "../config";
import { ShellInitializer, type ShellServices } from "./shellInitializer";

/**
 * Boot mode variants. Mutually exclusive — encoded as a single field so callers
 * can't accidentally combine them.
 *
 * - `register-only`: load plugins and register capabilities, then return.
 *   No ready hooks, no daemons, no jobs. Used by `brain operate` for command
 *   discovery.
 * - `startup-check`: run registration and ready hooks, then return without
 *   starting daemons or job workers. Used by external-package smoke tests to
 *   verify plugin loading without side effects (and without requiring an AI
 *   API key).
 */
export type BootMode = "register-only" | "startup-check";

export interface ShellBootloaderOptions {
  mode?: BootMode;
}

export interface ShellBootloaderHooks {
  registerCoreDataSources(): void;
  registerSystemCapabilities(): void;
}

/**
 * Coordinates shell startup phases.
 *
 * Shell remains the runtime facade; this class owns boot ordering so plugin
 * lifecycle semantics are explicit and testable.
 */
export class ShellBootloader {
  constructor(
    private readonly config: ShellConfig,
    private readonly services: ShellServices,
    private readonly hooks: ShellBootloaderHooks,
  ) {}

  public async boot(options?: ShellBootloaderOptions): Promise<void> {
    this.services.logger.debug("Starting Shell boot");

    const shellInitializer = ShellInitializer.getInstance(
      this.services.logger,
      this.config,
    );

    // Initialize databases (WAL mode, migrations, indexes, ATTACH) before
    // plugins load — they need search and embeddings to work.
    await this.services.entityService.initialize();

    await shellInitializer.initializeAll(
      this.services.templateRegistry,
      this.services.entityRegistry,
      this.services.pluginManager,
      {
        ...(options?.mode === "register-only" && { registerOnly: true }),
        ...(this.config.entityDisplay !== undefined && {
          registrationContext: { entityDisplay: this.config.entityDisplay },
        }),
      },
    );

    // Register job handlers for content operations before any ready signals.
    shellInitializer.registerJobHandlers(
      this.services.jobQueueService,
      this.services.contentService,
      this.services.entityService,
    );

    this.hooks.registerCoreDataSources();
    this.hooks.registerSystemCapabilities();

    if (options?.mode === "register-only") {
      this.services.logger.debug("Shell boot complete (register-only mode)");
      return;
    }

    if (options?.mode !== "startup-check") {
      await this.startEarlyWebserver();

      // Run initial sync (driven by pluginsRegistered subscribers) before
      // materializing ready-state defaults. Singleton defaults must not be
      // created while a directory import may still populate existing markdown
      // from brain-data into the entity DB.
      await this.emitPluginsRegistered();
    }

    await this.prepareReadyState();

    await this.services.pluginManager.readyPlugins();

    if (options?.mode === "startup-check") {
      this.services.logger.debug("Shell boot complete (startup-check mode)");
      return;
    }

    await this.startRuntimeServices();

    this.services.logger.debug("Shell boot complete");
  }

  private async startEarlyWebserver(): Promise<void> {
    const webserverDaemonName = "webserver:webserver";
    if (!this.services.daemonRegistry.has(webserverDaemonName)) return;

    await this.services.daemonRegistry.start(webserverDaemonName);
    this.services.logger.debug("Started webserver before initial sync");
  }

  private async emitPluginsRegistered(): Promise<void> {
    await this.services.messageBus.send(
      SYSTEM_CHANNELS.pluginsRegistered,
      {
        timestamp: new Date().toISOString(),
        pluginCount: this.services.pluginManager.getAllPluginIds().length,
      },
      "shell",
      undefined,
      undefined,
      true,
    );
    this.services.logger.debug("Emitted plugins registered event");
  }

  private async prepareReadyState(): Promise<void> {
    await Promise.all([
      this.services.identityService.initialize(),
      this.services.profileService.initialize(),
    ]);
    this.services.logger.debug("Identity and profile services initialized");

    const count = await materializePrompts(
      this.services.templateRegistry,
      this.services.entityService,
    );
    if (count > 0) {
      this.services.logger.debug(`Materialized ${count} prompt entities`);
    }
  }

  private async startRuntimeServices(): Promise<void> {
    await this.services.pluginManager.startPluginDaemons();
    await this.services.jobQueueWorker.start();
    this.services.jobProgressMonitor.start();
  }
}
