import { Logger, toError } from "@brains/utils";
import type {
  Daemon,
  DaemonHealth,
  DaemonInfo,
  DaemonStatusInfo,
} from "@brains/plugins";
import {
  checkDaemonInfoHealth,
  getDaemonStatusInfo,
  startDaemonInfo,
  stopDaemonInfo,
} from "./daemon-operations";

/**
 * Daemon registry for managing long-running interface processes
 * Implements Component Interface Standardization pattern
 */
export class DaemonRegistry {
  private static instance: DaemonRegistry | null = null;

  private daemons: Map<string, DaemonInfo> = new Map();
  private logger: Logger;

  /**
   * Get the singleton instance of DaemonRegistry
   */
  public static getInstance(
    logger: Logger = Logger.getInstance(),
  ): DaemonRegistry {
    DaemonRegistry.instance ??= new DaemonRegistry(logger);
    return DaemonRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    DaemonRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): DaemonRegistry {
    return new DaemonRegistry(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger.child("DaemonRegistry");
  }

  /**
   * Register a daemon
   */
  public register(name: string, daemon: Daemon, pluginId: string): void {
    if (this.daemons.has(name)) {
      this.logger.warn(`Daemon already registered: ${name}, overwriting`);
    }

    const daemonInfo: DaemonInfo = {
      name,
      daemon,
      pluginId,
      status: "stopped",
    };

    this.daemons.set(name, daemonInfo);
    this.logger.debug(`Registered daemon: ${name} from plugin: ${pluginId}`);
  }

  /**
   * Check if a daemon is registered
   */
  public has(name: string): boolean {
    return this.daemons.has(name);
  }

  /**
   * Get daemon info
   */
  public get(name: string): DaemonInfo | undefined {
    return this.daemons.get(name);
  }

  /**
   * Start a daemon
   */
  public async start(name: string): Promise<void> {
    const daemonInfo = this.daemons.get(name);
    if (!daemonInfo) {
      throw new Error(`Daemon not registered: ${name}`);
    }

    await startDaemonInfo(daemonInfo, this.logger);
  }

  /**
   * Stop a daemon
   */
  public async stop(name: string): Promise<void> {
    const daemonInfo = this.daemons.get(name);
    if (!daemonInfo) {
      throw new Error(`Daemon not registered: ${name}`);
    }

    await stopDaemonInfo(daemonInfo, this.logger);
  }

  /**
   * Check daemon health
   */
  public async checkHealth(name: string): Promise<DaemonHealth | undefined> {
    const daemonInfo = this.daemons.get(name);
    if (!daemonInfo) {
      throw new Error(`Daemon not registered: ${name}`);
    }

    return checkDaemonInfoHealth(daemonInfo);
  }

  /**
   * Get all daemons for a plugin
   */
  public getByPlugin(pluginId: string): DaemonInfo[] {
    return Array.from(this.daemons.values()).filter(
      (info) => info.pluginId === pluginId,
    );
  }

  /**
   * Get all daemon names
   */
  public getAll(): string[] {
    return Array.from(this.daemons.keys());
  }

  /**
   * Get all daemon info
   */
  public getAllInfo(): DaemonInfo[] {
    return Array.from(this.daemons.values());
  }

  /**
   * Get daemon statuses with fresh health checks
   */
  public async getStatuses(): Promise<DaemonStatusInfo[]> {
    const allDaemons = this.getAllInfo();

    // Refresh health checks for all daemons
    for (const daemon of allDaemons) {
      if (daemon.daemon.healthCheck) {
        await this.checkHealth(daemon.name);
      }
    }

    // Return fresh status info
    return allDaemons.map(getDaemonStatusInfo);
  }

  /**
   * Unregister a daemon (stops it first if running)
   */
  public async unregister(name: string): Promise<void> {
    const daemonInfo = this.daemons.get(name);
    if (!daemonInfo) {
      this.logger.warn(`Daemon not registered: ${name}`);
      return;
    }

    // Stop the daemon if it's running
    if (daemonInfo.status === "running") {
      await this.stop(name);
    }

    this.daemons.delete(name);
    this.logger.debug(`Unregistered daemon: ${name}`);
  }

  /**
   * Start all daemons for a plugin
   */
  public async startPlugin(pluginId: string): Promise<void> {
    const pluginDaemons = this.getByPlugin(pluginId);
    this.logger.debug(
      `Starting ${pluginDaemons.length} daemons for plugin: ${pluginId}`,
    );

    let firstError: Error | undefined;

    for (const daemonInfo of pluginDaemons) {
      try {
        await this.start(daemonInfo.name);
      } catch (error) {
        firstError ??= toError(error);
      }
    }

    if (firstError) {
      throw firstError;
    }
  }

  /**
   * Stop all daemons for a plugin
   */
  public async stopPlugin(pluginId: string): Promise<void> {
    const pluginDaemons = this.getByPlugin(pluginId);
    this.logger.debug(
      `Stopping ${pluginDaemons.length} daemons for plugin: ${pluginId}`,
    );

    for (const daemonInfo of pluginDaemons) {
      try {
        await this.stop(daemonInfo.name);
      } catch (error) {
        this.logger.error(`Failed to stop daemon: ${daemonInfo.name}`, error);
        // Continue stopping other daemons even if one fails
      }
    }
  }

  /**
   * Clear all daemons (stops them all first)
   */
  public async clear(): Promise<void> {
    this.logger.debug("Clearing all daemons");

    const runningDaemons = Array.from(this.daemons.values()).filter(
      (info) => info.status === "running",
    );

    for (const daemonInfo of runningDaemons) {
      try {
        await this.stop(daemonInfo.name);
      } catch (error) {
        this.logger.error(
          `Failed to stop daemon during clear: ${daemonInfo.name}`,
          error,
        );
      }
    }

    this.daemons.clear();
    this.logger.debug("All daemons cleared");
  }
}
