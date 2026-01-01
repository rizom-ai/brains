import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { RetryTracker } from "../src/retry-tracker";

describe("RetryTracker", () => {
  let tracker: RetryTracker;

  beforeEach(() => {
    tracker = RetryTracker.createFresh({ maxRetries: 3, baseDelayMs: 1000 });
  });

  describe("recordFailure", () => {
    it("should increment retry count", () => {
      tracker.recordFailure("entity-1", "Network error");

      const info = tracker.getRetryInfo("entity-1");
      expect(info?.retryCount).toBe(1);
    });

    it("should store last error", () => {
      tracker.recordFailure("entity-1", "Network error");

      const info = tracker.getRetryInfo("entity-1");
      expect(info?.lastError).toBe("Network error");
    });

    it("should calculate next retry time with exponential backoff", () => {
      const beforeFirst = Date.now();
      tracker.recordFailure("entity-1", "Error 1");
      const info1 = tracker.getRetryInfo("entity-1");

      // First retry: baseDelay * 2^0 = 1000ms
      expect(info1?.nextRetryAt).toBeGreaterThanOrEqual(beforeFirst + 1000);

      tracker.recordFailure("entity-1", "Error 2");
      const info2 = tracker.getRetryInfo("entity-1");

      // Second retry: baseDelay * 2^1 = 2000ms
      expect(info2?.nextRetryAt).toBeGreaterThan(info1?.nextRetryAt ?? 0);
    });
  });

  describe("shouldRetry", () => {
    it("should return true when under max retries", () => {
      tracker.recordFailure("entity-1", "Error");

      expect(tracker.shouldRetry("entity-1")).toBe(true);
    });

    it("should return false when max retries exceeded", () => {
      tracker.recordFailure("entity-1", "Error 1");
      tracker.recordFailure("entity-1", "Error 2");
      tracker.recordFailure("entity-1", "Error 3");

      expect(tracker.shouldRetry("entity-1")).toBe(false);
    });

    it("should return false for unknown entity", () => {
      expect(tracker.shouldRetry("unknown")).toBe(false);
    });
  });

  describe("isReadyForRetry", () => {
    it("should return false if retry time not reached", () => {
      tracker.recordFailure("entity-1", "Error");

      expect(tracker.isReadyForRetry("entity-1")).toBe(false);
    });

    it("should return true if retry time has passed", async () => {
      // Use shorter delay for testing
      tracker = RetryTracker.createFresh({ maxRetries: 3, baseDelayMs: 10 });
      tracker.recordFailure("entity-1", "Error");

      // Wait for delay to pass
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(tracker.isReadyForRetry("entity-1")).toBe(true);
    });

    it("should return false for unknown entity", () => {
      expect(tracker.isReadyForRetry("unknown")).toBe(false);
    });
  });

  describe("clearRetries", () => {
    it("should remove retry info for entity", () => {
      tracker.recordFailure("entity-1", "Error");

      tracker.clearRetries("entity-1");

      expect(tracker.getRetryInfo("entity-1")).toBeNull();
    });
  });

  describe("getRetryInfo", () => {
    it("should return null for unknown entity", () => {
      expect(tracker.getRetryInfo("unknown")).toBeNull();
    });

    it("should return complete retry info", () => {
      tracker.recordFailure("entity-1", "Network error");

      const info = tracker.getRetryInfo("entity-1");

      expect(info).toMatchObject({
        entityId: "entity-1",
        retryCount: 1,
        lastError: "Network error",
        willRetry: true,
      });
      expect(info?.nextRetryAt).toBeDefined();
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const instance1 = RetryTracker.getInstance();
      const instance2 = RetryTracker.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should return fresh instance after reset", () => {
      const instance1 = RetryTracker.getInstance();
      RetryTracker.resetInstance();
      const instance2 = RetryTracker.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    afterEach(() => {
      RetryTracker.resetInstance();
    });
  });
});
