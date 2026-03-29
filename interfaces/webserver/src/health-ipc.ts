/**
 * Shared IPC types and constants for health check between
 * the main brain process (ServerManager) and the webserver child process.
 */
import { z } from "@brains/utils";

// ─── IPC message schema ────────────────────────────────────────────────────

export const healthMessageSchema = z.object({
  type: z.literal("heartbeat"),
});

export type HealthMessage = z.infer<typeof healthMessageSchema>;

// ─── Constants ─────────────────────────────────────────────────────────────

/** How often the main process sends heartbeats (ms) */
export const HEARTBEAT_INTERVAL_MS = 5_000;

/** How long before a missing heartbeat means unhealthy (ms) */
export const HEARTBEAT_STALE_MS = 15_000;

// ─── Health check logic (shared, testable) ─────────────────────────────────

export interface HealthState {
  lastHeartbeat: number | null;
}

/**
 * Create a health state tracker.
 * Used by the child process to track heartbeats from the main process.
 */
export function createHealthState(): HealthState {
  return { lastHeartbeat: null };
}

/**
 * Record a heartbeat in the health state.
 */
export function recordHeartbeat(state: HealthState, now?: number): void {
  state.lastHeartbeat = now ?? Date.now();
}

/**
 * Check if the health state indicates a healthy process.
 * Healthy = received at least one heartbeat and it's within the staleness window.
 */
export function isHealthy(state: HealthState, now?: number): boolean {
  if (state.lastHeartbeat === null) return false;
  const elapsed = (now ?? Date.now()) - state.lastHeartbeat;
  return elapsed <= HEARTBEAT_STALE_MS;
}
