import { describe, it, expect } from "bun:test";
import {
  ChatInterface,
  MockChatSdk,
  baseDiscordConfig,
  baseSlackConfig,
  createDiscordAdapterMock,
  createMemoryStateMock,
  createMessage,
  createPlugin,
  createSlackAdapterMock,
  createThread,
  lastAdapter,
  setupChatInterfaceTest,
  socketSlackConfig,
} from "./harness/chat-interface-harness";

describe("ChatInterface mount", () => {
  const suite = setupChatInterfaceTest();

  it("creates a Chat SDK app with Discord adapter credentials and subscription state", async () => {
    const plugin = createPlugin();

    await suite.harness.installPlugin(plugin);

    expect(plugin.id).toBe("chat");
    expect(plugin.packageName).toBe("@brains/chat");
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
    expect(state).toBeDefined();
    if (!state) throw new Error("Expected Chat SDK state adapter");
    await state.subscribe("discord:guild-123:channel-123:thread-456");
    expect(
      await state.isSubscribed("discord:guild-123:channel-123:thread-456"),
    ).toBe(true);
  });

  it("creates Slack and Discord adapters together", async () => {
    const plugin = new ChatInterface({
      adapters: {
        discord: baseDiscordConfig,
        slack: baseSlackConfig,
      },
      gatewayRunMs: 50,
    });

    await suite.harness.installPlugin(plugin);

    expect(createDiscordAdapterMock).toHaveBeenCalledTimes(1);
    expect(createSlackAdapterMock).toHaveBeenCalledWith({
      botToken: "slack-token",
      signingSecret: "slack-signing-secret",
    });
    expect(MockChatSdk.instances[0]?.config.adapters.discord).toBeDefined();
    expect(MockChatSdk.instances[0]?.config.adapters.slack).toBeDefined();
    expect(
      suite.harness.getMockShell().getDaemonRegistry().getByPlugin("chat"),
    ).toHaveLength(1);
  });

  it("registers separate channel descriptors for configured adapters", async () => {
    const plugin = new ChatInterface({
      adapters: {
        discord: baseDiscordConfig,
        slack: baseSlackConfig,
      },
    });

    await suite.harness.installPlugin(plugin);
    await suite.harness.finalizeRegistration();

    expect(
      suite.harness.getMockShell().getChannelRegistry().listDescriptors(),
    ).toEqual([
      {
        type: "discord",
        displayName: "Discord",
        subjectLabel: "Discord user ID",
        subjectPattern: { source: "^[0-9]{17,20}$" },
        manualDelivery: true,
      },
      {
        type: "slack",
        displayName: "Slack",
        subjectLabel: "Slack member ID",
        subjectPattern: { source: "^[UW][A-Z0-9]+$" },
        manualDelivery: true,
      },
    ]);
  });

  it("creates a Slack-only adapter and daemon", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });

    await suite.harness.installPlugin(plugin);

    expect(createDiscordAdapterMock).not.toHaveBeenCalled();
    expect(createSlackAdapterMock).toHaveBeenCalledTimes(1);
    expect(MockChatSdk.instances[0]?.config.adapters.discord).toBeUndefined();
    expect(MockChatSdk.instances[0]?.config.adapters.slack).toBeDefined();
    expect(
      suite.harness.getMockShell().getDaemonRegistry().getByPlugin("chat"),
    ).toHaveLength(1);
  });

  it("runs Slack Socket Mode without exposing a webhook", async () => {
    const plugin = new ChatInterface({
      adapters: { slack: socketSlackConfig },
      gatewayRunMs: 50,
      gatewayRestartDelayMs: 0,
    });
    await suite.harness.installPlugin(plugin);
    const registry = suite.harness.getMockShell().getDaemonRegistry();
    const route = plugin
      .getWebRoutes()
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

    await registry.startPlugin("chat");
    await Bun.sleep(0);
    await registry.stopPlugin("chat");

    expect(lastAdapter.slack?.startSocketModeListener).toHaveBeenCalled();
    expect(
      lastAdapter.slack?.startSocketModeListener.mock.calls[0]?.[2]?.aborted,
    ).toBe(true);
  });

  it("runs Discord gateway and Slack Socket Mode together", async () => {
    const plugin = new ChatInterface({
      adapters: {
        discord: baseDiscordConfig,
        slack: socketSlackConfig,
      },
      gatewayRunMs: 50,
      gatewayRestartDelayMs: 0,
    });
    await suite.harness.installPlugin(plugin);
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin("chat");
    await Bun.sleep(0);
    await registry.stopPlugin("chat");

    expect(lastAdapter.discord?.startGatewayListener).toHaveBeenCalled();
    expect(lastAdapter.slack?.startSocketModeListener).toHaveBeenCalled();
  });

  it("refuses to mount with no adapter configured", () => {
    // The resolver turns this into a skipped interface, so a brain without
    // chat credentials carries no chat plugin at all rather than one that
    // registers webhook routes only to 404 on them.
    expect(() => new ChatInterface()).toThrow(/Invalid plugin config for chat/);
    expect(() => new ChatInterface({ adapters: {} })).toThrow(
      /Invalid plugin config for chat/,
    );
    expect(createDiscordAdapterMock).not.toHaveBeenCalled();
    expect(createSlackAdapterMock).not.toHaveBeenCalled();
  });

  it("ignores unsupported Chat SDK threads", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
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
