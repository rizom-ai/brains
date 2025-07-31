import { Logger } from "@brains/utils";
import type { Daemon, DaemonHealth } from "@brains/plugin-base";

/**
 * Information about a registered daemon
 */
export interface DaemonInfo {
  name: string;
  daemon: Daemon;
  pluginId: string;
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  health?: DaemonHealth;
  error?: Error;
  startedAt?: Date;
  stoppedAt?: Date;
}

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
    this.logger.debug(`Registering daemon: ${name} from plugin: ${pluginId}`);

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
    this.logger.info(`Registered daemon: ${name} from plugin: ${pluginId}`);
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

    if (daemonInfo.status === "running") {
      this.logger.warn(`Daemon already running: ${name}`);
      return;
    }

    this.logger.info(`Starting daemon: ${name}`);
    daemonInfo.status = "starting";
    delete daemonInfo.error;

    try {
      await daemonInfo.daemon.start();
      daemonInfo.status = "running";
      daemonInfo.startedAt = new Date();
      this.logger.info(`Daemon started successfully: ${name}`);
    } catch (error) {
      daemonInfo.status = "error";
      daemonInfo.error =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to start daemon: ${name}`, error);
      throw error;
    }
  }

  /**
   * Stop a daemon
   */
  public async stop(name: string): Promise<void> {
    const daemonInfo = this.daemons.get(name);
    if (!daemonInfo) {
      throw new Error(`Daemon not registered: ${name}`);
    }

    if (daemonInfo.status === "stopped") {
      this.logger.warn(`Daemon already stopped: ${name}`);
      return;
    }

    this.logger.info(`Stopping daemon: ${name}`);
    daemonInfo.status = "stopping";

    try {
      await daemonInfo.daemon.stop();
      daemonInfo.status = "stopped";
      daemonInfo.stoppedAt = new Date();
      this.logger.info(`Daemon stopped successfully: ${name}`);
    } catch (error) {
      daemonInfo.status = "error";
      daemonInfo.error =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to stop daemon: ${name}`, error);
      throw error;
    }
  }

  /**
   * Check daemon health
   */
  public async checkHealth(name: string): Promise<DaemonHealth | undefined> {
    const daemonInfo = this.daemons.get(name);
    if (!daemonInfo) {
      throw new Error(`Daemon not registered: ${name}`);
    }

    if (!daemonInfo.daemon.healthCheck) {
      return undefined;
    }

    try {
      const health = await daemonInfo.daemon.healthCheck();
      daemonInfo.health = health;
      return health;
    } catch (error) {
      const errorHealth: DaemonHealth = {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        lastCheck: new Date(),
      };
      daemonInfo.health = errorHealth;
      return errorHealth;
    }
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
    this.logger.info(`Unregistered daemon: ${name}`);
  }

  /**
   * Start all daemons for a plugin
   */
  public async startPlugin(pluginId: string): Promise<void> {
    const pluginDaemons = this.getByPlugin(pluginId);
    this.logger.info(
      `Starting ${pluginDaemons.length} daemons for plugin: ${pluginId}`,
    );

    for (const daemonInfo of pluginDaemons) {
      try {
        await this.start(daemonInfo.name);
      } catch (error) {
        this.logger.error(`Failed to start daemon: ${daemonInfo.name}`, error);
        // Continue starting other daemons even if one fails
      }
    }
  }

  /**
   * Stop all daemons for a plugin
   */
  public async stopPlugin(pluginId: string): Promise<void> {
    const pluginDaemons = this.getByPlugin(pluginId);
    this.logger.info(
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
    this.logger.info("All daemons cleared");
  }
}
