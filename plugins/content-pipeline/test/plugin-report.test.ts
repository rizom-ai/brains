import { describe, it, expect, beforeEach } from "bun:test";
import { ContentPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("ContentPipelinePlugin - Report Handlers", () => {
  let harness: PluginTestHarness<ContentPipelinePlugin>;
  let plugin: ContentPipelinePlugin;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    plugin = new ContentPipelinePlugin({});
    await harness.installPlugin(plugin);
  });

  describe("publish:report:success handler", () => {
    it("should clear retry info on success report", async () => {
      const retryTracker = plugin.getRetryTracker();
      retryTracker.recordFailure("post-1", "Previous error");
      expect(retryTracker.getRetryInfo("post-1")).not.toBeNull();

      await harness.sendMessage(PUBLISH_MESSAGES.REPORT_SUCCESS, {
        entityType: "social-post",
        entityId: "post-1",
        result: { id: "platform-123" },
      });

      expect(retryTracker.getRetryInfo("post-1")).toBeNull();
    });
  });

  describe("publish:report:failure handler", () => {
    it("should record failure and track retries", async () => {
      await harness.sendMessage(PUBLISH_MESSAGES.REPORT_FAILURE, {
        entityType: "social-post",
        entityId: "post-1",
        error: "Network error",
      });

      const retryTracker = plugin.getRetryTracker();
      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
      expect(retryInfo?.lastError).toBe("Network error");
    });

    it("should indicate willRetry=false after max retries", async () => {
      const limitedHarness = createPluginHarness<ContentPipelinePlugin>({
        dataDir: "/tmp/test-limited",
      });
      const limitedPlugin = new ContentPipelinePlugin({ maxRetries: 2 });
      await limitedHarness.installPlugin(limitedPlugin);

      await limitedHarness.sendMessage(PUBLISH_MESSAGES.REPORT_FAILURE, {
        entityType: "social-post",
        entityId: "post-1",
        error: "Error 1",
      });

      await limitedHarness.sendMessage(PUBLISH_MESSAGES.REPORT_FAILURE, {
        entityType: "social-post",
        entityId: "post-1",
        error: "Error 2",
      });

      const retryInfo = limitedPlugin.getRetryTracker().getRetryInfo("post-1");
      expect(retryInfo?.willRetry).toBe(false);
    });
  });
});
