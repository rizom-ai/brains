import { describe, it, expect, beforeEach } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("SocialMediaPlugin - Publish Pipeline Registration", () => {
  let harness: PluginTestHarness<SocialMediaPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-social",
    });
    receivedMessages = [];

    harness.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after system:plugins:ready with linkedin provider", async () => {
      await harness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );

      await harness.sendMessage(
        "system:plugins:ready",
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "social-post",
      });
      expect(registerMessage?.payload).toHaveProperty(
        "provider.name",
        "linkedin",
      );
    });

    it("should not send publish:register if no providers configured", async () => {
      await harness.installPlugin(new SocialMediaPlugin({}));

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeUndefined();
    });
  });

  describe("publish:execute subscription", () => {
    it("should subscribe to publish:execute messages", async () => {
      await harness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );

      // Sending triggers the handler — verify it ran via side effects
      harness.subscribe("publish:report:failure", async (msg) => {
        receivedMessages.push({
          type: "publish:report:failure",
          payload: msg.payload,
        });
        return { success: true };
      });

      await harness.sendMessage("publish:execute", {
        entityType: "social-post",
        entityId: "non-existent",
      });

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
    });
  });
});
