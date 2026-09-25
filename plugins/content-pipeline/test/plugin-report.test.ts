import { describe, it, expect, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import { ContentPipelinePlugin } from "../src/plugin";
import {
  PUBLISH_MESSAGES,
  type PublishFailedPayload,
} from "../src/types/messages";
import { uploadEvidence } from "./helpers/publish-recovery";
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
    it("forwards validated recovery unchanged through the real report subscription", async () => {
      const evidence = uploadEvidence();
      const observed: PublishFailedPayload[] = [];
      harness.subscribe<PublishFailedPayload>(
        PUBLISH_MESSAGES.FAILED,
        async (message) => {
          observed.push(message.payload);
          return { success: true };
        },
      );
      await harness.sendMessage(PUBLISH_MESSAGES.REPORT_FAILURE, {
        entityType: "social-post",
        entityId: "post-1",
        error: "Publication failed; do not replay",
        recovery: evidence,
      });
      expect(observed).toHaveLength(1);
      expect(observed[0]).toEqual({
        entityType: "social-post",
        entityId: "post-1",
        error: "Publication failed; do not replay",
        retryCount: 1,
        willRetry: false,
        recovery: evidence,
      });
      expect(observed[0]?.recovery).not.toBe(evidence);
      expect(Object.isFrozen(observed[0]?.recovery)).toBe(true);
    });

    it("rejects malformed recovery before retry accounting or broadcasting", async () => {
      let published = 0;
      harness.subscribe(PUBLISH_MESSAGES.FAILED, async () => {
        published++;
        return { success: true };
      });
      await assert.rejects(
        harness.sendMessage(PUBLISH_MESSAGES.REPORT_FAILURE, {
          entityType: "social-post",
          entityId: "post-1",
          error: "failure",
          recovery: {
            ...uploadEvidence(),
            nodes: [{ kind: "error", cause: 15 }],
          },
        }),
        /dangling reference/,
      );
      expect(published).toBe(0);
      expect(plugin.getRetryTracker().getRetryInfo("post-1")).toBeNull();
    });

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
  });
});
