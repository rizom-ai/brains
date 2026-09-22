import { describe, it, expect } from "bun:test";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createPlugin,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("ChatInterface webhook routes", () => {
  const suite = setupChatInterfaceTest();
  it("delegates Discord webhook routes to Chat SDK", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/discord");
    const response = await route?.handler(
      new Request("https://brain.test/hook"),
    );
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.discord).toHaveBeenCalled();
  });
  it("delegates configured Slack webhooks to Chat SDK", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/slack");
    const response = await route?.handler(
      new Request("https://brain.test/slack-hook"),
    );
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("slack webhook ok");
    expect(MockChatSdk.instances[0]?.webhooks.slack).toHaveBeenCalled();
  });
  it("returns 404 from Slack webhook route when Slack is not configured", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/slack");
    const response = await route?.handler(
      new Request("https://brain.test/slack-hook"),
    );
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Slack chat webhook not configured");
  });
  it("returns 404 from Discord webhook route when no Discord adapter is configured", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const route = plugin
      .getWebRoutes()
      .find((candidate) => candidate.path === "/api/webhooks/chat/discord");
    const response = await route?.handler(
      new Request("https://brain.test/hook"),
    );
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Discord chat webhook not configured");
  });
  it.each(["slack", "discord"])(
    "does not register legacy upload downloads with %s configured",
    async (platform) => {
      const plugin =
        platform === "slack"
          ? new ChatInterface({ adapters: { slack: baseSlackConfig } })
          : createPlugin();
      await suite.harness.installPlugin(plugin);
      expect(
        plugin.getWebRoutes().map(({ path, method }) => ({ path, method })),
      ).toEqual([
        { path: "/api/webhooks/chat/discord", method: "POST" },
        { path: "/api/webhooks/chat/slack", method: "POST" },
      ]);
    },
  );
});
