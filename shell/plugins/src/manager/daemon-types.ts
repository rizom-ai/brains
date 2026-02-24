import { z } from "@brains/utils";

/**
 * Daemon health status schema
 */
export const DaemonHealthSchema = z.object({
  status: z.enum(["healthy", "warning", "error", "unknown"]),
  message: z.string().optional(),
  lastCheck: z.date().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type DaemonHealth = z.infer<typeof DaemonHealthSchema>;

/**
 * Daemon status info schema for validation
 */
export const DaemonStatusInfoSchema = z.object({
  name: z.string(),
  status: z.string(),
  health: DaemonHealthSchema.optional(),
});

export type DaemonStatusInfo = z.infer<typeof DaemonStatusInfoSchema>;

/**
 * Daemon interface for long-running interface processes
 */
export interface Daemon {
  /**
   * Start the daemon - called when plugin is initialized
   */
  start: () => Promise<void>;

  /**
   * Stop the daemon - called when plugin is unloaded/shutdown
   */
  stop: () => Promise<void>;

  /**
   * Optional health check - called periodically to monitor daemon health
   */
  healthCheck?: () => Promise<DaemonHealth>;
}

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
 * Interface for DaemonRegistry — used by plugins to avoid circular dep with core
 */
export interface IDaemonRegistry {
  register(name: string, daemon: Daemon, pluginId: string): void;
  has(name: string): boolean;
  get(name: string): DaemonInfo | undefined;
  start(name: string): Promise<void>;
  stop(name: string): Promise<void>;
  checkHealth(name: string): Promise<DaemonHealth | undefined>;
  getByPlugin(pluginId: string): DaemonInfo[];
  getAll(): string[];
  getAllInfo(): DaemonInfo[];
  getStatuses(): Promise<DaemonStatusInfo[]>;
  unregister(name: string): Promise<void>;
  startPlugin(pluginId: string): Promise<void>;
  stopPlugin(pluginId: string): Promise<void>;
  clear(): Promise<void>;
}
