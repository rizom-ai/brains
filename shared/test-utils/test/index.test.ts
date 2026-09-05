import { describe, it, expect } from "bun:test";
import {
  createSilentLogger,
  createMockLogger,
  createMockProgressReporter,
} from "../src";

describe("@brains/test-utils", () => {
  describe("createSilentLogger", () => {
    it("should write nothing", () => {
      const written: unknown[] = [];
      const original = console.info;
      console.info = (...args: unknown[]): void => {
        written.push(args);
      };

      try {
        createSilentLogger("test").info("should not appear");
      } finally {
        console.info = original;
      }

      expect(written).toEqual([]);
    });
  });

  describe("createMockLogger", () => {
    it("should create a mock logger with spyable methods", () => {
      const logger = createMockLogger();
      expect(logger).toBeDefined();
      logger.info("test message");
      expect(logger.info).toHaveBeenCalledWith("test message");
    });
  });

  describe("createMockProgressReporter", () => {
    it("should create a mock progress reporter", async () => {
      const reporter = createMockProgressReporter();
      await reporter.report({ progress: 50, message: "halfway" });
      expect(reporter.report).toHaveBeenCalledWith({
        progress: 50,
        message: "halfway",
      });
    });
  });
});
