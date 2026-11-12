import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import {
  createChatPlugin,
  baseDiscordConfig,
  baseSlackConfig,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

const discordChannel = {
  type: "discord",
  displayName: "Discord",
  subjectLabel: "Discord user ID",
  subjectPattern: { source: "^[0-9]{17,20}$" },
  manualDelivery: true,
};
const slackChannel = {
  type: "slack",
  displayName: "Slack",
  subjectLabel: "Slack member ID",
  subjectPattern: { source: "^[UW][A-Z0-9]+$" },
  manualDelivery: true,
};

/**
 * What the chat interface registers, pinned as its class registered it: one
 * plugin for Discord and Slack, their channels without a sender, the Chat
 * SDK daemon, the webhook routes and the space-notice answer.
 */
describe("the chat interface's registered surface", () => {
  const suite = setupChatInterfaceTest();

  it("registers plugin chat with both platforms' channels, daemon and webhooks", async () => {
    const plugin = createChatPlugin({
      adapters: { discord: baseDiscordConfig, slack: baseSlackConfig },
      gatewayRunMs: 50,
    });
    const capabilities = await suite.harness.installPlugin(plugin);
    const shell = suite.harness.getMockShell();
    shell.getChannelRegistry().finalize();
    const registry = shell.getDaemonRegistry();

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "chat",
      "interface",
      "@brains/chat",
    ]);
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(shell.getChannelRegistry().listDescriptors()).toEqual([
      discordChannel,
      slackChannel,
    ]);
    expect(
      shell.getChannelRegistry().getDeliveryProvider("discord"),
    ).toBeUndefined();
    expect(
      shell.getChannelRegistry().getDeliveryProvider("slack"),
    ).toBeUndefined();
    expect(registry.getAll()).toEqual(["chat:chat"]);
    expect(registry.get("chat:chat")?.pluginId).toBe("chat");
    expect(await registry.checkHealth("chat:chat")).toEqual({
      status: "error",
      message: "Chat SDK app stopped",
      lastCheck: expect.any(Date),
    });
    expect(plugin.requiresDaemonStartup()).toBe(false);
    expect(
      plugin
        .getWebRoutes()
        .filter(({ path }) => !path.endsWith("/uploads"))
        .map(
          (route) =>
            `${route.method ?? "GET"} ${route.path} public=${String(route.public ?? false)}`,
        ),
    ).toEqual([
      "POST /api/webhooks/chat/discord public=true",
      "POST /api/webhooks/chat/slack public=true",
    ]);
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("registers only the configured platform's channel", async () => {
    const plugin = createChatPlugin({
      adapters: { slack: baseSlackConfig },
    });
    await suite.harness.installPlugin(plugin);
    const shell = suite.harness.getMockShell();
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([
      slackChannel,
    ]);
  });

  it("registers its channels in the worker, and nothing else", async () => {
    const plugin = createChatPlugin({
      adapters: { discord: baseDiscordConfig, slack: baseSlackConfig },
    });
    const worker = createMockShell();
    await plugin.registerChannelsForExecution(worker);
    worker.getChannelRegistry().finalize();

    expect(worker.getChannelRegistry().listDescriptors()).toEqual([
      discordChannel,
      slackChannel,
    ]);
    expect(worker.getDaemonRegistry().getAll()).toEqual([]);
  });
});
