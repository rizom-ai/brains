import { describe, it, expect, jest, beforeEach } from "bun:test";
import { ProgressReporter } from "../src/progress";
import type { ProgressNotification } from "@brains/types";

describe("ProgressReporter", () => {
  let mockCallback: jest.Mock;

  beforeEach(() => {
    mockCallback = jest.fn().mockResolvedValue(undefined);
  });

  describe("from", () => {
    it("should return undefined when callback is undefined", () => {
      const progress = ProgressReporter.from(undefined);
      expect(progress).toBeUndefined();
    });

    it("should create a ProgressReporter when callback is provided", () => {
      const progress = ProgressReporter.from(mockCallback);
      expect(progress).toBeDefined();
    });
  });

  describe("report", () => {
    it("should call callback with message", async () => {
      const progress = ProgressReporter.from(mockCallback);
      await progress?.report("Test message");

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Test message",
      });
    });

    it("should call callback with progress and total", async () => {
      const progress = ProgressReporter.from(mockCallback);
      await progress?.report("Test message", 5, 10);

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        total: 10,
        message: "Test message",
      });
    });

    it("should not include total when undefined", async () => {
      const progress = ProgressReporter.from(mockCallback);
      await progress?.report("Test message", 5);

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        message: "Test message",
      });
    });
  });

  describe("createSub", () => {
    it("should create sub-progress with prefix", async () => {
      const progress = ProgressReporter.from(mockCallback);
      const sub = progress?.createSub("Sub task");

      await sub?.report("Working");

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Sub task: Working",
      });
    });

    it("should chain prefixes for nested sub-progress", async () => {
      const progress = ProgressReporter.from(mockCallback);
      const sub1 = progress?.createSub("Level 1");
      const sub2 = sub1?.createSub("Level 2");

      await sub2?.report("Working");

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Level 1: Level 2: Working",
      });
    });
  });

  describe("toCallback", () => {
    it("should return a callback function", async () => {
      const progress = ProgressReporter.from(mockCallback);
      const callback = progress?.toCallback();

      expect(typeof callback).toBe("function");

      const notification: ProgressNotification = {
        progress: 5,
        total: 10,
        message: "Test",
      };

      await callback?.(notification);

      expect(mockCallback).toHaveBeenCalledWith(notification);
    });

    it("should add prefix to callback messages", async () => {
      const progress = ProgressReporter.from(mockCallback);
      const sub = progress?.createSub("Prefix");
      const callback = sub?.toCallback();

      const notification: ProgressNotification = {
        progress: 5,
        message: "Test",
      };

      await callback?.(notification);

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        message: "Prefix: Test",
      });
    });

    it("should handle notifications without message", async () => {
      const progress = ProgressReporter.from(mockCallback);
      const sub = progress?.createSub("Prefix");
      const callback = sub?.toCallback();

      const notification: ProgressNotification = {
        progress: 5,
      };

      await callback?.(notification);

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        message: "Prefix",
      });
    });
  });

  describe("heartbeat", () => {
    // For heartbeat tests, we'll use real timers with shorter intervals
    // since Bun doesn't have timer mocking yet

    it("should start sending periodic messages", async () => {
      const progress = ProgressReporter.from(mockCallback);
      progress?.startHeartbeat("Still working...", 50); // 50ms interval

      // Wait for first heartbeat
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Still working...",
      });
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Wait for second heartbeat
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockCallback).toHaveBeenCalledTimes(2);

      // Clean up
      progress?.stopHeartbeat();
    });

    it("should stop heartbeat when stopHeartbeat is called", async () => {
      const progress = ProgressReporter.from(mockCallback);
      progress?.startHeartbeat("Still working...", 50);

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(mockCallback).toHaveBeenCalledTimes(1);

      progress?.stopHeartbeat();

      await new Promise((resolve) => setTimeout(resolve, 100));
      // Should still be 1, not incremented
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it("should clear previous heartbeat when starting a new one", async () => {
      const progress = ProgressReporter.from(mockCallback);

      // Start first heartbeat with message A
      progress?.startHeartbeat("Message A", 100);

      // Start second heartbeat with message B before first fires
      await new Promise((resolve) => setTimeout(resolve, 50));
      progress?.startHeartbeat("Message B", 50);

      // Wait for heartbeat
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should only have Message B
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Message B",
      });
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Clean up
      progress?.stopHeartbeat();
    });

    it("should include prefix in heartbeat messages", async () => {
      const progress = ProgressReporter.from(mockCallback);
      const sub = progress?.createSub("Task");

      sub?.startHeartbeat("Still working...", 50);

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Task: Still working...",
      });

      // Clean up
      sub?.stopHeartbeat();
    });
  });
});
