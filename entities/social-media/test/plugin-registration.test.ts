import { describe, it, expect, beforeEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
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

  describe("entity policy registration", () => {
    it("declares social-post publish statuses and secondary topic authority", async () => {
      await harness.installPlugin(new SocialMediaPlugin({}));

      expect(
        harness.getEntityRegistry().getEntityTypeConfig("social-post"),
      ).toMatchObject({
        projectionSourceRole: "secondary",
        publish: { publishStatuses: ["queued", "published", "failed"] },
      });
    });

    it("contributes no projection rule", async () => {
      const capabilities = await harness.installPlugin(
        new SocialMediaPlugin({}),
      );

      expect("projections" in capabilities).toBe(false);
      expect(capabilities.projectionRules).toBeUndefined();
    });
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with linkedin provider", async () => {
      await harness.installPlugin(
        new SocialMediaPlugin({ linkedin: { accessToken: "test-token" } }),
      );

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
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
      expect(registerMessage?.payload).toMatchObject({
        config: { publishResultIdField: "platformPostId" },
      });
    });

    it("should not send publish:register if no providers configured", async () => {
      await harness.installPlugin(new SocialMediaPlugin({}));

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeUndefined();
    });
  });
});
