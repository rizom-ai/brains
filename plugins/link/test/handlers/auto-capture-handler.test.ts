import { describe, it, expect, beforeEach } from "bun:test";
import { AutoCaptureHandler } from "../../src/handlers/auto-capture-handler";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins";

describe("AutoCaptureHandler", () => {
  let handler: AutoCaptureHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "link");

    // Reset singleton and create fresh instance
    AutoCaptureHandler.resetInstance();
    handler = AutoCaptureHandler.createFresh(context);
  });

  // Note: process() and onError() methods are integration concerns
  // They depend on LinkService, which depends on AI generation and entity service
  // These should be tested as integration tests, not unit tests

  describe("validateAndParse", () => {
    it("should validate valid job data", () => {
      const validData = {
        url: "https://example.com/article",
        metadata: {
          conversationId: "conv-123",
        },
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });

    it("should reject invalid URL", () => {
      const invalidData = {
        url: "not-a-url",
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should reject missing URL", () => {
      const invalidData = {
        metadata: {},
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should accept minimal valid data", () => {
      const validData = {
        url: "https://example.com",
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });
  });
});
