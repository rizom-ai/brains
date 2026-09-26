import { describe, it, expect } from "bun:test";
import {
  DISCORD_PLUGIN_ID,
  MockChatSdk,
  PACKAGE_NAME,
  SLACK_PLUGIN_ID,
  baseDiscordConfig,
  baseSlackConfig,
  createDiscordAdapterMock,
  createMemoryStateMock,
  createMessage,
  createPlugin,
  createPlugins,
  createSlackAdapterMock,
  createSlackPlugin,
  createThread,
  lastAdapter,
  setupChatInterfaceTest,
  socketSlackConfig,
} from "./harness/chat-interface-harness";

describe("chat mount", () => {
  const suite = setupChatInterfaceTest();

  it("creates a Chat SDK app with Discord adapter credentials and subscription state", async () => {
    const plugin = createPlugin();

    await suite.harness.installPlugin(plugin);

    expect(plugin.id).toBe(DISCORD_PLUGIN_ID);
    expect(plugin.packageName).toBe(PACKAGE_NAME);
    expect(createDiscordAdapterMock).toHaveBeenCalledWith({
      botToken: "discord-token",
      publicKey: "a".repeat(64),
      applicationId: "bot-user-123",
      mentionRoleIds: [],
    });
    expect(createMemoryStateMock).toHaveBeenCalledTimes(1);
    expect(MockChatSdk.instances).toHaveLength(1);
    expect(MockChatSdk.instances[0]?.config).toMatchObject({
      userName: "brain",
      concurrency: {
        strategy: "queue",
        maxQueueSize: 5,
        onQueueFull: "drop-oldest",
      },
    });
    const state = MockChatSdk.instances[0]?.config.state;
    if (!state) throw new Error("Expected Chat SDK state adapter");
    await state.subscribe("discord:guild-123:channel-123:thread-456");
    expect(
      await state.isSubscribed("discord:guild-123:channel-123:thread-456"),
    ).toBe(true);
  });

  it("runs Slack and Discord as two interfaces, each with its own app", async () => {
    const plugins = await suite.install({
      adapters: { discord: baseDiscordConfig, slack: baseSlackConfig },
      gatewayRunMs: 50,
    });

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      DISCORD_PLUGIN_ID,
      SLACK_PLUGIN_ID,
    ]);
    expect(createDiscordAdapterMock).toHaveBeenCalledTimes(1);
    expect(createSlackAdapterMock).toHaveBeenCalledWith({
      botToken: "slack-token",
      signingSecret: "slack-signing-secret",
    });
    // One app per platform: the Discord app knows nothing of Slack.
    expect(
      MockChatSdk.forPlatform("discord")?.config.adapters.slack,
    ).toBeUndefined();
    expect(
      MockChatSdk.forPlatform("slack")?.config.adapters.discord,
    ).toBeUndefined();
    const daemons = suite.harness.getMockShell().getDaemonRegistry();
    expect(daemons.getByPlugin(DISCORD_PLUGIN_ID)).toHaveLength(1);
    expect(daemons.getByPlugin(SLACK_PLUGIN_ID)).toHaveLength(1);
  });

  it("registers a channel descriptor per configured adapter", async () => {
    await suite.install({
      adapters: { discord: baseDiscordConfig, slack: baseSlackConfig },
    });
    await suite.harness.finalizeRegistration();

    expect(
      suite.harness.getMockShell().getChannelRegistry().listDescriptors(),
    ).toEqual([
      {
        type: "discord",
        displayName: "Discord",
        subjectLabel: "Discord user ID",
        subjectPattern: { source: "^[0-9]{17,20}$" },
      },
      {
        type: "slack",
        displayName: "Slack",
        subjectLabel: "Slack member ID",
        subjectPattern: { source: "^[UW][A-Z0-9]+$" },
      },
    ]);
  });

  it("creates a Slack-only adapter and listener", async () => {
    const plugin = createSlackPlugin();

    await suite.harness.installPlugin(plugin);

    expect(plugin.id).toBe(SLACK_PLUGIN_ID);
    expect(createDiscordAdapterMock).not.toHaveBeenCalled();
    expect(createSlackAdapterMock).toHaveBeenCalledTimes(1);
    expect(MockChatSdk.instances[0]?.config.adapters.discord).toBeUndefined();
    expect(MockChatSdk.instances[0]?.config.adapters.slack).toBeDefined();
    expect(
      suite.harness
        .getMockShell()
        .getDaemonRegistry()
        .getByPlugin(SLACK_PLUGIN_ID),
    ).toHaveLength(1);
  });

  it("runs Slack Socket Mode without exposing a webhook", async () => {
    const plugin = createSlackPlugin(socketSlackConfig, {
      gatewayRunMs: 50,
      gatewayRestartDelayMs: 0,
    });
    await suite.harness.installPlugin(plugin);
    const registry = suite.harness.getMockShell().getDaemonRegistry();
    const route = plugin
      .getWebRoutes?.()
      .find((candidate) => candidate.path === "/api/webhooks/chat/slack");

    expect(createSlackAdapterMock).toHaveBeenCalledWith({
      botToken: "slack-token",
      mode: "socket",
      appToken: "xapp-test",
    });
    const webhook = await route?.handler(
      new Request("https://brain.test/api/webhooks/chat/slack", {
        method: "POST",
      }),
    );
    expect(webhook?.status).toBe(404);

    await registry.startPlugin(SLACK_PLUGIN_ID);
    await Bun.sleep(0);
    await registry.stopPlugin(SLACK_PLUGIN_ID);

    expect(lastAdapter.slack?.startSocketModeListener).toHaveBeenCalled();
    expect(
      lastAdapter.slack?.startSocketModeListener.mock.calls[0]?.[2]?.aborted,
    ).toBe(true);
  });

  it("runs Discord gateway and Slack Socket Mode together", async () => {
    await suite.install({
      adapters: { discord: baseDiscordConfig, slack: socketSlackConfig },
      gatewayRunMs: 50,
      gatewayRestartDelayMs: 0,
    });
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin(DISCORD_PLUGIN_ID);
    await registry.startPlugin(SLACK_PLUGIN_ID);
    await Bun.sleep(0);
    await registry.stopPlugin(DISCORD_PLUGIN_ID);
    await registry.stopPlugin(SLACK_PLUGIN_ID);

    expect(lastAdapter.discord?.startGatewayListener).toHaveBeenCalled();
    expect(lastAdapter.slack?.startSocketModeListener).toHaveBeenCalled();
  });

  it("refuses a config with no adapter", () => {
    // The resolver turns this into a skipped package, so a brain without chat
    // credentials carries no chat interface at all rather than one that
    // registers webhook routes only to 404 on them.
    expect(() => createPlugins({})).toThrow(/Invalid plugin config for .*chat/);
    expect(() => createPlugins({ adapters: {} })).toThrow(
      /Invalid plugin config for .*chat/,
    );
    expect(createDiscordAdapterMock).not.toHaveBeenCalled();
    expect(createSlackAdapterMock).not.toHaveBeenCalled();
  });

  it("ignores threads from an adapter it does not own", async () => {
    await suite.harness.installPlugin(createPlugin());
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "other:workspace-123:channel-123:thread-456",
      channelId: "other:workspace-123:channel-123",
      adapter: { name: "other" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });
});
