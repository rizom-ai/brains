import { describe, it, expect, jest, beforeEach, afterEach } from "bun:test";
import { CallbackProgressReporter } from "../src/progress";
import type { ProgressNotification } from "../src/progress";

describe("ProgressReporter", () => {
  let mockCallback: jest.Mock;

  beforeEach(() => {
    mockCallback = jest.fn().mockResolvedValue(undefined);
  });

  describe("from", () => {
    it("should return undefined when callback is undefined", () => {
      const progress = CallbackProgressReporter.from(undefined);
      expect(progress).toBeUndefined();
    });

    it("should create a ProgressReporter when callback is provided", () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      expect(progress).toBeDefined();
    });
  });

  describe("noop", () => {
    it("always returns a reporter, never undefined", () => {
      expect(CallbackProgressReporter.noop()).toBeInstanceOf(
        CallbackProgressReporter,
      );
    });

    it("accepts reports without throwing", async () => {
      await CallbackProgressReporter.noop().report({
        progress: 50,
        total: 100,
      });
    });

    it("returns a distinct instance each call", () => {
      expect(CallbackProgressReporter.noop()).not.toBe(
        CallbackProgressReporter.noop(),
      );
    });
  });

  describe("report", () => {
    it("should call callback with message", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      await progress?.report({
        message: "Test message",
        progress: 0,
      });

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Test message",
      });
    });

    it("should call callback with progress and total", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      await progress?.report({
        message: "Test message",
        progress: 5,
        total: 10,
      });

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        total: 10,
        message: "Test message",
      });
    });

    it("should not include total when undefined", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      await progress?.report({
        message: "Test message",
        progress: 5,
      });

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        message: "Test message",
      });
    });
  });

  describe("createSub", () => {
    it("should create sub-progress without scaling", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      const sub = progress?.createSub();

      await sub?.report({
        message: "Working",
        progress: 5,
        total: 10,
      });

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
        total: 10,
        message: "Working",
      });
    });

    it("should scale progress for sub-reporters", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      // Create sub-reporter for range 10-90
      const sub = progress?.createSub({ scale: { start: 10, end: 90 } });

      await sub?.report({
        message: "Processing sub-task",
        progress: 50,
        total: 100,
      });

      // 50% of range 10-90 = 50
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
        message: "Processing sub-task",
      });
    });

    it("should chain scaled ranges for nested sub-progress", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      // First sub: maps 0-100 to 20-80 (60% of parent)
      const sub1 = progress?.createSub({ scale: { start: 20, end: 80 } });
      // Second sub: maps 0-100 to 0-50 of sub1's range
      const sub2 = sub1?.createSub({ scale: { start: 0, end: 50 } });

      await sub2?.report({
        message: "Deep nested task",
        progress: 100,
        total: 100,
      });

      // 100% of sub2 = 50% of sub1 = 50% of (20-80) = 50
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
        message: "Deep nested task",
      });
    });
  });

  describe("toCallback", () => {
    it("should return a callback function", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
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

    it("should scale progress in callback for sub-reporters", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      const sub = progress?.createSub({ scale: { start: 10, end: 90 } });
      const callback = sub?.toCallback();

      const notification: ProgressNotification = {
        progress: 50,
        total: 100,
        message: "Test",
      };

      await callback?.(notification);

      // 50% of range 10-90 = 50
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
        message: "Test",
      });
    });

    it("should handle notifications without message", async () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      const callback = progress?.toCallback();

      const notification: ProgressNotification = {
        progress: 5,
      };

      await callback?.(notification);

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 5,
      });
    });
  });

  describe("heartbeat", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should start sending periodic messages", () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      progress?.startHeartbeat("Still working...", 50); // 50ms interval

      jest.advanceTimersByTime(50);
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Still working...",
      });
      expect(mockCallback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(50);
      expect(mockCallback).toHaveBeenCalledTimes(2);

      // Clean up
      progress?.stopHeartbeat();
    });

    it("should stop heartbeat when stopHeartbeat is called", () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      progress?.startHeartbeat("Still working...", 50);

      jest.advanceTimersByTime(50);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      progress?.stopHeartbeat();

      jest.advanceTimersByTime(100);
      // Should still be 1, not incremented
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it("should clear previous heartbeat when starting a new one", () => {
      const progress = CallbackProgressReporter.from(mockCallback);

      // Start first heartbeat with message A
      progress?.startHeartbeat("Message A", 100);

      // Start second heartbeat with message B before first fires
      jest.advanceTimersByTime(50);
      progress?.startHeartbeat("Message B", 50);

      jest.advanceTimersByTime(50);

      // Should only have Message B
      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Message B",
      });
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Clean up
      progress?.stopHeartbeat();
    });

    it("should include prefix in heartbeat messages", () => {
      const progress = CallbackProgressReporter.from(mockCallback);
      const sub = progress?.createSub();

      sub?.startHeartbeat("Still working...", 50);

      jest.advanceTimersByTime(50);

      expect(mockCallback).toHaveBeenCalledWith({
        progress: 0,
        message: "Still working...",
      });

      // Clean up
      sub?.stopHeartbeat();
    });
  });
});
