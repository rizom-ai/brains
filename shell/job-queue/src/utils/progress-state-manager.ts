/**
 * Shared progress state management utilities
 * Used by interfaces for consistent progress tracking and throttling
 */

import type { JobProgressEvent } from "@brains/job-queue";
import { calculateETA, formatRate } from "./progress-calculations";

/**
 * Progress state for tracking multiple operations
 */
export interface ProgressState {
  events: Map<string, JobProgressEvent>;
  startTimes: Map<string, Date>;
  lastUpdates: Map<string, number>;
}

/**
 * Progress update action types
 */
export type ProgressAction =
  | { type: "UPDATE_PROGRESS"; event: JobProgressEvent }
  | { type: "CLEANUP_PROGRESS"; eventId: string }
  | { type: "RESET_PROGRESS" };

/**
 * Progress reducer for state management
 */
export function progressReducer(
  state: ProgressState,
  action: ProgressAction,
): ProgressState {
  switch (action.type) {
    case "UPDATE_PROGRESS": {
      const event = action.event;
      const newEvents = new Map(state.events);
      const newStartTimes = new Map(state.startTimes);
      const newLastUpdates = new Map(state.lastUpdates);

      // Only track events that are actively processing
      if (
        event.status === "processing" ||
        event.status === "completed" ||
        event.status === "failed"
      ) {
        // Track start time for new events
        if (!state.startTimes.has(event.id) && event.status === "processing") {
          newStartTimes.set(event.id, new Date());
        }

        // Calculate ETA and rate for events with progress info
        let enhancedEvent = { ...event };
        if (
          event.progress?.current !== undefined &&
          event.progress?.total !== undefined
        ) {
          const startTime = newStartTimes.get(event.id);
          if (startTime) {
            const calculation = calculateETA(
              event.progress.current,
              event.progress.total,
              startTime,
            );

            if (calculation) {
              enhancedEvent = {
                ...event,
                progress: {
                  ...event.progress,
                  eta: calculation.etaSeconds * 1000, // Convert to milliseconds
                  rate: calculation.rate,
                  etaFormatted: calculation.eta,
                  rateFormatted: formatRate(calculation.rate),
                },
              };
            }
          }
        }

        newEvents.set(event.id, enhancedEvent);
        newLastUpdates.set(event.id, Date.now());
      }

      return {
        events: newEvents,
        startTimes: newStartTimes,
        lastUpdates: newLastUpdates,
      };
    }

    case "CLEANUP_PROGRESS": {
      const newEvents = new Map(state.events);
      const newStartTimes = new Map(state.startTimes);
      const newLastUpdates = new Map(state.lastUpdates);

      newEvents.delete(action.eventId);
      newStartTimes.delete(action.eventId);
      newLastUpdates.delete(action.eventId);

      return {
        events: newEvents,
        startTimes: newStartTimes,
        lastUpdates: newLastUpdates,
      };
    }

    case "RESET_PROGRESS": {
      return {
        events: new Map(),
        startTimes: new Map(),
        lastUpdates: new Map(),
      };
    }

    default:
      return state;
  }
}

/**
 * Create initial progress state
 */
export function createInitialProgressState(): ProgressState {
  return {
    events: new Map(),
    startTimes: new Map(),
    lastUpdates: new Map(),
  };
}

/**
 * Progress event filtering and prioritization
 */
export interface ProgressEventGroups {
  batchEvents: JobProgressEvent[];
  jobEvents: JobProgressEvent[];
  primaryEvent: JobProgressEvent | null;
}

/**
 * Group and prioritize progress events
 */
export function groupProgressEvents(
  events: Map<string, JobProgressEvent>,
): ProgressEventGroups {
  const batchEvents: JobProgressEvent[] = [];
  const jobEvents: JobProgressEvent[] = [];

  for (const event of events.values()) {
    if (event.type === "batch") {
      batchEvents.push(event);
    } else {
      jobEvents.push(event);
    }
  }

  // Primary event selection: prefer batch events, then most recent job
  let primaryEvent: JobProgressEvent | null = null;
  if (batchEvents.length > 0) {
    primaryEvent = batchEvents[batchEvents.length - 1] || null;
  } else if (jobEvents.length > 0) {
    primaryEvent = jobEvents[jobEvents.length - 1] || null;
  }

  return {
    batchEvents,
    jobEvents,
    primaryEvent,
  };
}

/**
 * Throttling configuration
 */
export interface ThrottleConfig {
  minDisplayDuration: number; // minimum time to display an event (ms)
  updateInterval: number; // how often to allow updates (ms)
}

/**
 * Default throttle configuration
 */
export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  minDisplayDuration: 400, // 400ms minimum display
  updateInterval: 1000, // 1 second between updates
};

/**
 * Throttled update manager
 */
export class ProgressThrottleManager {
  private displayTimeouts = new Map<string, NodeJS.Timeout>();
  private lastUpdateTimes = new Map<string, number>();
  private config: ThrottleConfig;

  constructor(config: ThrottleConfig = DEFAULT_THROTTLE_CONFIG) {
    this.config = config;
  }

  /**
   * Check if an event should be updated based on throttling rules
   */
  shouldUpdate(eventId: string): boolean {
    const lastUpdate = this.lastUpdateTimes.get(eventId);
    if (!lastUpdate) return true;

    const elapsed = Date.now() - lastUpdate;
    return elapsed >= this.config.updateInterval;
  }

  /**
   * Mark an event as updated
   */
  markUpdated(eventId: string): void {
    this.lastUpdateTimes.set(eventId, Date.now());
  }

  /**
   * Schedule event cleanup after minimum display duration
   */
  scheduleCleanup(eventId: string, callback: () => void): void {
    // Clear existing timeout if any
    const existingTimeout = this.displayTimeouts.get(eventId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule cleanup
    const timeout = setTimeout(() => {
      callback();
      this.displayTimeouts.delete(eventId);
      this.lastUpdateTimes.delete(eventId);
    }, this.config.minDisplayDuration);

    this.displayTimeouts.set(eventId, timeout);
  }

  /**
   * Clear all timeouts and reset state
   */
  reset(): void {
    for (const timeout of this.displayTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.displayTimeouts.clear();
    this.lastUpdateTimes.clear();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.reset();
  }
}
