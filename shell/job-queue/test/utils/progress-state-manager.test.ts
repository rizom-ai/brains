import { describe, test, expect, beforeEach } from "bun:test";
import {
  progressReducer,
  createInitialProgressState,
  groupProgressEvents,
  ProgressThrottleManager,
  type ProgressState,
} from "../../src/utils/progress-state-manager";
import type { JobProgressEvent } from "../../src/job-progress-monitor";

const mockJobEvent: JobProgressEvent = {
  id: "job-1",
  type: "job",
  status: "processing",
  progress: {
    current: 50,
    total: 100,
    percentage: 50,
  },
  metadata: {
    userId: "user-1",
    interfaceId: "test",
    operationType: "entity_processing",
  },
};

const mockBatchEvent: JobProgressEvent = {
  id: "batch-1",
  type: "batch",
  status: "processing",
  batchDetails: {
    completedOperations: 3,
    totalOperations: 10,
    failedOperations: 0,
  },
  metadata: {
    userId: "user-1",
    interfaceId: "test",
    operationType: "entity_processing",
  },
};

describe("progressReducer", () => {
  let initialState: ProgressState;

  beforeEach(() => {
    initialState = createInitialProgressState();
  });

  test("UPDATE_PROGRESS adds processing events", () => {
    const state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: mockJobEvent,
    });

    const storedEvent = state.events.get("job-1");
    expect(storedEvent).toBeDefined();
    if (storedEvent) {
      expect(storedEvent.id).toBe("job-1");
    }
    expect(state.startTimes.has("job-1")).toBe(true);
    expect(state.lastUpdates.has("job-1")).toBe(true);
  });

  test("UPDATE_PROGRESS calculates ETA and rate for events with progress", () => {
    // First add the event to establish start time
    let state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: mockJobEvent,
    });

    // Wait a bit to simulate progress by setting a past start time
    const mockStartTime = new Date(Date.now() - 5000); // 5 seconds ago
    state.startTimes.set("job-1", mockStartTime);

    // Update with more progress
    const updatedEvent = {
      ...mockJobEvent,
      progress: {
        current: 75,
        total: 100,
        percentage: 75,
      },
    };

    state = progressReducer(state, {
      type: "UPDATE_PROGRESS",
      event: updatedEvent,
    });

    const storedEvent = state.events.get("job-1");
    expect(storedEvent).toBeDefined();
    if (storedEvent) {
      expect(storedEvent.progress?.etaFormatted).toBeDefined();
      expect(storedEvent.progress?.rateFormatted).toBeDefined();
      expect(storedEvent.progress?.eta).toBeTypeOf("number");
      expect(storedEvent.progress?.rate).toBeTypeOf("number");
    }
  });

  test("UPDATE_PROGRESS handles events without progress info", () => {
    const eventWithoutProgress = {
      ...mockJobEvent,
      progress: undefined,
    };

    const state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: eventWithoutProgress,
    });

    const storedEvent = state.events.get("job-1");
    expect(storedEvent).toBeDefined();
    if (storedEvent) {
      expect(storedEvent.progress).toBeUndefined();
    }
  });

  test("UPDATE_PROGRESS updates existing events", () => {
    // Add initial event
    let state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: mockJobEvent,
    });

    const originalStartTime = state.startTimes.get("job-1");
    expect(originalStartTime).toBeDefined(); // Ensure it exists

    // Update the same event
    const updatedEvent = {
      ...mockJobEvent,
      progress: {
        current: 75,
        total: 100,
        percentage: 75,
      },
    };
    state = progressReducer(state, {
      type: "UPDATE_PROGRESS",
      event: updatedEvent,
    });

    expect(state.events.get("job-1")).toEqual(updatedEvent);
    if (originalStartTime !== undefined) {
      expect(state.startTimes.get("job-1")).toBe(originalStartTime); // Start time preserved
    }
  });

  test("UPDATE_PROGRESS handles completed events", () => {
    const completedEvent = { ...mockJobEvent, status: "completed" as const };
    const state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: completedEvent,
    });

    expect(state.events.get("job-1")).toEqual(completedEvent);
  });

  test("UPDATE_PROGRESS ignores non-processing events", () => {
    const pendingEvent = { ...mockJobEvent, status: "pending" as const };
    const state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: pendingEvent,
    });

    expect(state.events.has("job-1")).toBe(false);
  });

  test("CLEANUP_PROGRESS removes events", () => {
    // Add event first
    let state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: mockJobEvent,
    });

    expect(state.events.has("job-1")).toBe(true);

    // Clean up
    state = progressReducer(state, {
      type: "CLEANUP_PROGRESS",
      eventId: "job-1",
    });

    expect(state.events.has("job-1")).toBe(false);
    expect(state.startTimes.has("job-1")).toBe(false);
    expect(state.lastUpdates.has("job-1")).toBe(false);
  });

  test("RESET_PROGRESS clears all state", () => {
    // Add some events
    let state = progressReducer(initialState, {
      type: "UPDATE_PROGRESS",
      event: mockJobEvent,
    });
    state = progressReducer(state, {
      type: "UPDATE_PROGRESS",
      event: mockBatchEvent,
    });

    expect(state.events.size).toBe(2);

    // Reset
    state = progressReducer(state, { type: "RESET_PROGRESS" });

    expect(state.events.size).toBe(0);
    expect(state.startTimes.size).toBe(0);
    expect(state.lastUpdates.size).toBe(0);
  });
});

describe("createInitialProgressState", () => {
  test("creates empty state", () => {
    const state = createInitialProgressState();

    expect(state.events.size).toBe(0);
    expect(state.startTimes.size).toBe(0);
    expect(state.lastUpdates.size).toBe(0);
  });
});

describe("groupProgressEvents", () => {
  test("groups events by type", () => {
    const events = new Map<string, JobProgressEvent>([
      ["job-1", mockJobEvent],
      ["batch-1", mockBatchEvent],
      ["job-2", { ...mockJobEvent, id: "job-2" }],
    ]);

    const groups = groupProgressEvents(events);

    expect(groups.batchEvents).toHaveLength(1);
    expect(groups.jobEvents).toHaveLength(2);
    expect(groups.primaryEvent).toEqual(mockBatchEvent); // Batch events prioritized
  });

  test("prioritizes batch events as primary", () => {
    const events = new Map<string, JobProgressEvent>([
      ["job-1", mockJobEvent],
      ["batch-1", mockBatchEvent],
    ]);

    const groups = groupProgressEvents(events);
    expect(groups.primaryEvent).toEqual(mockBatchEvent);
  });

  test("uses most recent job as primary when no batch events", () => {
    const job2 = { ...mockJobEvent, id: "job-2" };
    const events = new Map<string, JobProgressEvent>([
      ["job-1", mockJobEvent],
      ["job-2", job2],
    ]);

    const groups = groupProgressEvents(events);
    expect(groups.primaryEvent).toEqual(job2); // Most recent
  });

  test("returns null primary when no events", () => {
    const events = new Map<string, JobProgressEvent>();
    const groups = groupProgressEvents(events);

    expect(groups.primaryEvent).toBeNull();
    expect(groups.batchEvents).toHaveLength(0);
    expect(groups.jobEvents).toHaveLength(0);
  });
});

describe("ProgressThrottleManager", () => {
  let manager: ProgressThrottleManager;

  beforeEach(() => {
    manager = new ProgressThrottleManager({
      minDisplayDuration: 100,
      updateInterval: 50,
    });
  });

  test("allows first update", () => {
    expect(manager.shouldUpdate("event-1")).toBe(true);
  });

  test("throttles rapid updates", () => {
    manager.markUpdated("event-1");
    expect(manager.shouldUpdate("event-1")).toBe(false);
  });

  test("allows updates after interval", async () => {
    manager.markUpdated("event-1");

    // Wait for interval to pass
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(manager.shouldUpdate("event-1")).toBe(true);
  });

  test("schedules cleanup callbacks", async () => {
    let cleanupCalled = false;

    manager.scheduleCleanup("event-1", () => {
      cleanupCalled = true;
    });

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(cleanupCalled).toBe(true);
  });

  test("cancels previous cleanup when rescheduled", async () => {
    let firstCleanupCalled = false;
    let secondCleanupCalled = false;

    manager.scheduleCleanup("event-1", () => {
      firstCleanupCalled = true;
    });

    // Reschedule before first cleanup fires
    manager.scheduleCleanup("event-1", () => {
      secondCleanupCalled = true;
    });

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(firstCleanupCalled).toBe(false);
    expect(secondCleanupCalled).toBe(true);
  });

  test("resets all state", () => {
    manager.markUpdated("event-1");
    manager.scheduleCleanup("event-2", () => {});

    manager.reset();

    expect(manager.shouldUpdate("event-1")).toBe(true);
  });

  test("uses default config when none provided", () => {
    const defaultManager = new ProgressThrottleManager();
    expect(defaultManager.shouldUpdate("test")).toBe(true);
  });
});
