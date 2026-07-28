import { describe, it, expect, beforeEach } from "bun:test";
import { RetryTracker } from "../src/retry-tracker";

describe("RetryTracker", () => {
  let tracker: RetryTracker;

  beforeEach(() => {
    tracker = RetryTracker.createFresh();
  });

  describe("recordFailure", () => {
    it("should increment failure count", () => {
      tracker.recordFailure("entity-1", "Network error");

      const info = tracker.getRetryInfo("entity-1");
      expect(info?.retryCount).toBe(1);
    });

    it("should accumulate failure count across repeated failures", () => {
      tracker.recordFailure("entity-1", "Error 1");
      tracker.recordFailure("entity-1", "Error 2");

      const info = tracker.getRetryInfo("entity-1");
      expect(info?.retryCount).toBe(2);
    });

    it("should store last error", () => {
      tracker.recordFailure("entity-1", "Network error");

      const info = tracker.getRetryInfo("entity-1");
      expect(info?.lastError).toBe("Network error");
    });
  });

  describe("clearRetries", () => {
    it("should remove failure info for entity", () => {
      tracker.recordFailure("entity-1", "Error");

      tracker.clearRetries("entity-1");

      expect(tracker.getRetryInfo("entity-1")).toBeNull();
    });
  });

  describe("getRetryInfo", () => {
    it("should return null for unknown entity", () => {
      expect(tracker.getRetryInfo("unknown")).toBeNull();
    });

    it("should return failure info", () => {
      tracker.recordFailure("entity-1", "Network error");

      const info = tracker.getRetryInfo("entity-1");

      expect(info).toEqual({
        entityId: "entity-1",
        retryCount: 1,
        lastError: "Network error",
      });
    });
  });
});
