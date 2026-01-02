import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";

describe("PublishPipelinePlugin - Report Handlers", () => {
  let plugin: PublishPipelinePlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-datadir" });
    plugin = new PublishPipelinePlugin({ tickIntervalMs: 100 });
    await plugin.register(mockShell);
  });

  afterEach(async () => {
    await plugin.cleanup();
    mock.restore();
  });

  describe("publish:report:success handler", () => {
    it("should clear retry info on success report", async () => {
      const messageBus = mockShell.getMessageBus();

      // First record a failure
      const retryTracker = plugin.getRetryTracker();
      retryTracker.recordFailure("post-1", "Previous error");
      expect(retryTracker.getRetryInfo("post-1")).not.toBeNull();

      // Report success
      await messageBus.send(
        PUBLISH_MESSAGES.REPORT_SUCCESS,
        {
          entityType: "social-post",
          entityId: "post-1",
          result: { id: "platform-123" },
        },
        "test",
      );

      // Retry info should be cleared
      expect(retryTracker.getRetryInfo("post-1")).toBeNull();
    });
  });

  describe("publish:report:failure handler", () => {
    it("should record failure and track retries", async () => {
      const messageBus = mockShell.getMessageBus();

      await messageBus.send(
        PUBLISH_MESSAGES.REPORT_FAILURE,
        {
          entityType: "social-post",
          entityId: "post-1",
          error: "Network error",
        },
        "test",
      );

      const retryTracker = plugin.getRetryTracker();
      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
      expect(retryInfo?.lastError).toBe("Network error");
    });

    it("should indicate willRetry=false after max retries", async () => {
      // Create plugin with maxRetries=2
      const limitedPlugin = new PublishPipelinePlugin({
        tickIntervalMs: 100,
        maxRetries: 2,
      });
      const limitedShell = MockShell.createFresh({
        logger,
        dataDir: "/tmp/test-limited",
      });
      await limitedPlugin.register(limitedShell);

      const messageBus = limitedShell.getMessageBus();

      // First failure
      await messageBus.send(
        PUBLISH_MESSAGES.REPORT_FAILURE,
        { entityType: "social-post", entityId: "post-1", error: "Error 1" },
        "test",
      );

      // Second failure (max retries reached)
      await messageBus.send(
        PUBLISH_MESSAGES.REPORT_FAILURE,
        { entityType: "social-post", entityId: "post-1", error: "Error 2" },
        "test",
      );

      const retryInfo = limitedPlugin.getRetryTracker().getRetryInfo("post-1");
      expect(retryInfo?.willRetry).toBe(false);

      await limitedPlugin.cleanup();
    });
  });
});
