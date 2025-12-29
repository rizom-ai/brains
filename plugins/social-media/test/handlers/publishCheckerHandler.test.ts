import { describe, it, expect, beforeEach } from "bun:test";
import {
  PublishCheckerJobHandler,
  publishCheckerJobSchema,
} from "../../src/handlers/publishCheckerHandler";
import { socialMediaConfigSchema } from "../../src/config";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import { ProgressReporter } from "@brains/utils";

describe("PublishCheckerJobHandler", () => {
  let handler: PublishCheckerJobHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;
  const config = socialMediaConfigSchema.parse({});
  const pluginId = "social-media";

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, pluginId);
    handler = new PublishCheckerJobHandler(logger, context, config, pluginId);

    // Track progress calls
    progressCalls = [];
    const reporter = ProgressReporter.from(async (notification) => {
      const entry: { progress: number; message?: string } = {
        progress: notification.progress,
      };
      if (notification.message !== undefined) {
        entry.message = notification.message;
      }
      progressCalls.push(entry);
    });
    if (!reporter) {
      throw new Error("Failed to create progress reporter");
    }
    progressReporter = reporter;
  });

  describe("publishCheckerJobSchema", () => {
    it("should validate empty object", () => {
      const result = publishCheckerJobSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("validateAndParse", () => {
    it("should validate empty data", () => {
      const result = handler.validateAndParse({});
      expect(result).not.toBeNull();
    });
  });

  describe("process", () => {
    it("should succeed with no queued posts", async () => {
      const result = await handler.process({}, "job-123", progressReporter);

      expect(result.success).toBe(true);
      expect(result.publishJobId).toBeUndefined();
      expect(result.nextCheckScheduled).toBe(true);
    });

    it("should schedule next check even when disabled", async () => {
      const disabledConfig = socialMediaConfigSchema.parse({ enabled: false });
      const disabledHandler = new PublishCheckerJobHandler(
        logger,
        context,
        disabledConfig,
        pluginId,
      );

      const result = await disabledHandler.process(
        {},
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.nextCheckScheduled).toBe(true);
    });

    it("should report progress during check", async () => {
      await handler.process({}, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]?.message).toContain("Checking");
    });
  });
});
