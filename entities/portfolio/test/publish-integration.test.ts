import { describe, it, expect, beforeEach } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { PortfolioPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("PortfolioPlugin - Publish Pipeline Integration", () => {
  let harness: PluginTestHarness<PortfolioPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<PortfolioPlugin>({
      dataDir: "/tmp/test-portfolio",
    });
    receivedMessages = [];

    for (const eventType of [
      "publish:register",
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with internal provider", async () => {
      await harness.installPlugin(new PortfolioPlugin({}));

      expect(
        receivedMessages.find((m) => m.type === "publish:register"),
      ).toBeUndefined();

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
        entityType: "project",
        provider: { name: "internal" },
      });
    });
  });
});
