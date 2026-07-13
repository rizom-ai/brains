import { getErrorMessage, toError } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { IShell, PluginRegistrationContext } from "../interfaces";
import type { EventEmitter } from "events";
import type { PluginCapabilities } from "../interfaces";
import type { IDaemonRegistry } from "./daemon-types";
import type { PluginInfo } from "./types";
import { PluginStatus, PluginEvent } from "./types";
import { PluginError } from "../errors";
import { Exit } from "effect";
import {
  createPluginScopedShell,
  PluginResourceScope,
} from "./plugin-resource-scope";

/**
 * Handles plugin initialization and terminal resource teardown.
 * Extracted from PluginManager for single responsibility.
 */
export class PluginLifecycle {
  private plugins: Map<string, PluginInfo>;
  private events: EventEmitter;
  private daemonRegistry: IDaemonRegistry;
  private logger: Logger;
  private readonly resourceScopes = new Map<string, PluginResourceScope>();
  private readonly releasedPluginIds = new Set<string>();

  constructor(
    plugins: Map<string, PluginInfo>,
    events: EventEmitter,
    daemonRegistry: IDaemonRegistry,
    logger: Logger,
  ) {
    this.plugins = plugins;
    this.events = events;
    this.daemonRegistry = daemonRegistry;
    this.logger = logger.child("PluginLifecycle");
  }

  /**
   * Initialize a specific plugin
   */
  public async initializePlugin(
    pluginId: string,
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new PluginError(
        pluginId,
        "Registration failed: Plugin is not registered",
      );
    }

    const plugin = pluginInfo.plugin;
    const resources = new PluginResourceScope();
    resources.addFinalizer(() =>
      shell.unregisterPluginCapabilities?.(pluginId),
    );
    resources.addFinalizer(() =>
      shell.getJobQueueService().unregisterPluginHandlers(pluginId),
    );
    this.resourceScopes.set(pluginId, resources);
    this.releasedPluginIds.delete(pluginId);

    this.logger.debug(`Initializing plugin: ${pluginId}`);

    try {
      this.events.emit(PluginEvent.BEFORE_INITIALIZE, pluginId, plugin);
      const capabilities = await plugin.register(
        createPluginScopedShell(shell, resources),
        registrationContext,
      );

      pluginInfo.status = PluginStatus.INITIALIZED;
      this.logger.debug(`Initialized plugin: ${pluginId}`);

      // Daemons start in a later shell phase after all plugins have registered
      // and ready hooks have run.
      this.events.emit(PluginEvent.INITIALIZED, pluginId, plugin);

      return capabilities;
    } catch (error) {
      this.logger.error(
        `Error initializing plugin ${pluginId}: ${getErrorMessage(error)}`,
      );
      await this.failPluginInitialization(pluginId, error);
      throw error;
    }
  }

  /**
   * Dispatch ready hook for a plugin.
   */
  public async readyPlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new PluginError(pluginId, "Ready failed: Plugin is not registered");
    }

    if (pluginInfo.status !== PluginStatus.INITIALIZED) {
      this.logger.debug(
        `Skipping ready hook for non-initialized plugin: ${pluginId}`,
      );
      return;
    }

    try {
      await pluginInfo.plugin.ready?.();
      this.logger.debug(`Ready hook completed for plugin: ${pluginId}`);
    } catch (error) {
      const readyError = toError(error);
      pluginInfo.status = PluginStatus.ERROR;
      pluginInfo.error = readyError;
      try {
        this.events.emit(PluginEvent.ERROR, pluginId, readyError);
      } catch (eventError) {
        this.logger.error(
          `Plugin error listener failed for ${pluginId}`,
          eventError,
        );
      }
      throw readyError;
    }
  }

  /**
   * Start any daemons registered by a plugin.
   */
  public async startPluginDaemons(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (pluginInfo?.status !== PluginStatus.INITIALIZED) {
      return;
    }

    try {
      await this.daemonRegistry.startPlugin(pluginId);
      this.logger.debug(`Started daemons for plugin: ${pluginId}`);
    } catch (error) {
      if (pluginInfo.plugin.requiresDaemonStartup?.()) {
        throw error;
      }
      this.logger.warn(
        `Daemon ${pluginId} failed to start: ${getErrorMessage(error)}`,
      );
    }
  }

  /** Mark a failed registration phase and release everything acquired so far. */
  public async failPluginInitialization(
    id: string,
    error: unknown,
  ): Promise<void> {
    const pluginInfo = this.plugins.get(id);
    if (!pluginInfo) return;

    const shouldEmit = pluginInfo.status !== PluginStatus.ERROR;
    const failure = toError(error);
    pluginInfo.status = PluginStatus.ERROR;
    pluginInfo.error = failure;
    await this.releasePluginResources(id, Exit.fail(error));

    if (shouldEmit) {
      try {
        this.events.emit(PluginEvent.ERROR, id, failure);
      } catch (eventError) {
        this.logger.error(`Plugin error listener failed for ${id}`, eventError);
      }
    }
  }

  /** Terminally release one plugin. Plugin instances are not re-enabled. */
  public async disablePlugin(id: string): Promise<void> {
    const pluginInfo = this.plugins.get(id);
    if (!pluginInfo) {
      this.logger.warn(`Cannot disable plugin ${id}: not registered`);
      return;
    }
    if (pluginInfo.status === PluginStatus.DISABLED) return;

    this.logger.debug(`Disabling plugin: ${id}`);
    const failed = pluginInfo.status === PluginStatus.ERROR;
    await this.releasePluginResources(id, Exit.void);

    if (!failed) {
      pluginInfo.status = PluginStatus.DISABLED;
      this.events.emit(PluginEvent.DISABLED, id, pluginInfo.plugin);
    }
    this.logger.debug(`Disabled plugin: ${id}`);
  }

  private async releasePluginResources(
    id: string,
    exit: Exit.Exit<unknown, unknown>,
  ): Promise<void> {
    if (this.releasedPluginIds.has(id)) return;
    this.releasedPluginIds.add(id);
    const pluginInfo = this.plugins.get(id);
    if (!pluginInfo) return;

    try {
      await this.daemonRegistry.stopPlugin(id);
      this.logger.debug(`Stopped daemons for plugin: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to stop daemons for plugin: ${id}`, error);
    }

    if (pluginInfo.plugin.shutdown) {
      try {
        await pluginInfo.plugin.shutdown();
        this.logger.debug(`Shutdown completed for plugin: ${id}`);
      } catch (error) {
        this.logger.error(`Plugin shutdown failed for ${id}:`, error);
      }
    }

    for (const daemon of this.daemonRegistry.getByPlugin(id)) {
      try {
        await this.daemonRegistry.unregister(daemon.name);
      } catch (error) {
        this.logger.error(
          `Failed to unregister daemon ${daemon.name} for plugin ${id}`,
          error,
        );
      }
    }

    const resources = this.resourceScopes.get(id);
    this.resourceScopes.delete(id);
    if (resources) {
      try {
        await resources.close(exit);
      } catch (error) {
        this.logger.error(`Failed to close resources for plugin ${id}`, error);
      }
    }
  }
}
