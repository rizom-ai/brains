import { describe, it, expect, beforeEach } from "bun:test";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { Plugin } from "@brains/plugins";
import type { RetryTracker } from "../src/retry-tracker";
import { installPipeline } from "./helpers/install";

describe("content pipeline report handlers", () => {
  let harness: PluginTestHarness<Plugin>;
  let retryTracker: RetryTracker;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    ({ retryTracker } = await installPipeline(harness));
  });

  describe("publish:report:success handler", () => {
    it("should clear retry info on success report", async () => {
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

      const retryInfo = retryTracker.getRetryInfo("post-1");
      expect(retryInfo?.retryCount).toBe(1);
      expect(retryInfo?.lastError).toBe("Network error");
    });
  });
});
