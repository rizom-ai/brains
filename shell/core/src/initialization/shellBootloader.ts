import { materializePrompts, SYSTEM_CHANNELS } from "@brains/plugins";
import type { ShellConfig } from "../config";
import { ShellInitializer, type ShellServices } from "./shellInitializer";

export interface ShellBootloaderOptions {
  registerOnly?: boolean;
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
        ...(options?.registerOnly && { registerOnly: true }),
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

    if (options?.registerOnly) {
      this.services.logger.debug("Shell boot complete (registerOnly mode)");
      return;
    }

    // Run initial sync (driven by pluginsRegistered subscribers) concurrently
    // with prepareReadyState. Both are independent: sync imports markdown into
    // the entity DB; prepareReadyState creates default identity/profile/prompt
    // entities only if missing, and the entity service uses upsert semantics
    // so a concurrent file import wins.
    await Promise.all([this.emitPluginsRegistered(), this.prepareReadyState()]);

    await this.services.pluginManager.readyPlugins();
    await this.startRuntimeServices();

    this.services.logger.debug("Shell boot complete");
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
