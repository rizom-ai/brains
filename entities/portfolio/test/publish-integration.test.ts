import { describe, it, expect, beforeEach } from "bun:test";
import { publishRegisterContract } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import {
  portfolioPlugin,
  type PortfolioEntityPlugin,
} from "./portfolio-plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("the portfolio in the publish pipeline", () => {
  let harness: PluginTestHarness<PortfolioEntityPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<PortfolioEntityPlugin>({
      dataDir: "/tmp/test-portfolio",
    });
    receivedMessages = [];

    for (const eventType of [publishRegisterContract.name]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("provider registration", () => {
    it("should send publish:register message after plugins-registered with internal provider", async () => {
      await harness.installPlugin(portfolioPlugin());

      expect(
        receivedMessages.find((m) => m.type === publishRegisterContract.name),
      ).toBeUndefined();

      await harness.sendMessage(
        SYSTEM_CHANNELS.pluginsRegistered,
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === publishRegisterContract.name,
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "project",
        provider: { name: "internal" },
      });
    });
  });
});
