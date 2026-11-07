import { describe, expect, it, mock } from "bun:test";
import type { Adapter } from "chat";
import type { WhatsAppChatAdapterConfig } from "../src/config";
import type {
  WhatsAppConnectionStatus,
  WhatsAppRuntime,
  WhatsAppRuntimeOptions,
} from "../src/whatsapp-runtime";
import {
  ChatInterface,
  MockChatSdk,
  createMessage,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

const whatsappConfig: WhatsAppChatAdapterConfig = {
  phoneNumber: "31600000001",
  allowedChannels: [],
  blockedUrlDomains: [],
  requireMention: true,
  allowDMs: true,
  showTypingIndicator: true,
  captureUrls: false,
};

const DM_THREAD = "whatsapp:31612345678@s.whatsapp.net";
const GROUP_JID = "120363000000000000@g.us";
const GROUP_THREAD = `whatsapp:${GROUP_JID}`;

function unused(): never {
  throw new Error("Not used by the interface tests");
}

/** A WhatsApp adapter stand-in; the real one is covered by its own suite. */
function createFakeAdapter(): Adapter {
  return {
    name: "whatsapp",
    userName: "brain",
    initialize: async (): Promise<void> => {},
    handleWebhook: async (): Promise<Response> =>
      new Response("Not found", { status: 404 }),
    encodeThreadId: (data: unknown): string => `whatsapp:${String(data)}`,
    decodeThreadId: (threadId: string): unknown => threadId,
    channelIdFromThreadId: (threadId: string): string => threadId,
    isDM: (): boolean => true,
    parseMessage: unused,
    postMessage: unused,
    editMessage: unused,
    deleteMessage: unused,
    addReaction: unused,
    removeReaction: unused,
    startTyping: async (): Promise<void> => {},
    fetchMessages: async () => ({ messages: [] }),
    fetchThread: async (threadId: string) => ({
      id: threadId,
      channelId: threadId,
      isDM: true,
      metadata: {},
    }),
    renderFormatted: (): string => "",
  };
}

interface FakeWhatsApp {
  runtime: WhatsAppRuntime;
  createWhatsApp: ReturnType<
    typeof mock<(options: WhatsAppRuntimeOptions) => Promise<WhatsAppRuntime>>
  >;
  setStatus(status: WhatsAppConnectionStatus): void;
  start: ReturnType<typeof mock<() => void>>;
  stop: ReturnType<typeof mock<() => Promise<void>>>;
}

function createFakeWhatsApp(): FakeWhatsApp {
  const state: { status: WhatsAppConnectionStatus } = { status: "connected" };
  const start = mock((): void => {});
  const stop = mock(async (): Promise<void> => {});
  const runtime: WhatsAppRuntime = {
    adapter: createFakeAdapter(),
    loop: {
      start,
      stop,
      isRunning: (): boolean => true,
      status: (): WhatsAppConnectionStatus => state.status,
    },
  };
  return {
    runtime,
    createWhatsApp: mock(async () => runtime),
    setStatus: (status): void => {
      state.status = status;
    },
    start,
    stop,
  };
}

function createWhatsAppPlugin(
  whatsapp: FakeWhatsApp,
  config: Partial<WhatsAppChatAdapterConfig> = {},
): InstanceType<typeof ChatInterface> {
  return new ChatInterface(
    { adapters: { whatsapp: { ...whatsappConfig, ...config } } },
    undefined,
    { createWhatsApp: whatsapp.createWhatsApp },
  );
}

describe("ChatInterface WhatsApp", () => {
  const suite = setupChatInterfaceTest();

  it("registers a WhatsApp channel keyed by phone number", async () => {
    await suite.harness.installPlugin(
      createWhatsAppPlugin(createFakeWhatsApp()),
    );
    await suite.harness.finalizeRegistration();

    expect(
      suite.harness.getMockShell().getChannelRegistry().listDescriptors(),
    ).toEqual([
      {
        type: "whatsapp",
        displayName: "WhatsApp",
        subjectLabel: "WhatsApp phone number",
        subjectPattern: { source: "^(?:[0-9]{7,15}|[0-9]+@lid)$" },
        manualDelivery: true,
      },
    ]);
  });

  it("builds the Chat SDK app around the WhatsApp adapter", async () => {
    const whatsapp = createFakeWhatsApp();

    await suite.harness.installPlugin(createWhatsAppPlugin(whatsapp));

    expect(whatsapp.createWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ config: whatsappConfig, userName: "brain" }),
    );
    expect(MockChatSdk.instances[0]?.config.adapters).toEqual({
      whatsapp: whatsapp.runtime.adapter,
    });
  });

  it("does not load WhatsApp when registering channels in a worker", async () => {
    const whatsapp = createFakeWhatsApp();
    const plugin = createWhatsAppPlugin(whatsapp);

    await plugin.registerChannelsForExecution(suite.harness.getMockShell(), {
      executionOnly: true,
    });

    expect(whatsapp.createWhatsApp).not.toHaveBeenCalled();
    expect(MockChatSdk.instances).toHaveLength(0);
  });

  it("starts and stops the WhatsApp connection with the daemon", async () => {
    const whatsapp = createFakeWhatsApp();
    await suite.harness.installPlugin(createWhatsAppPlugin(whatsapp));
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin("chat");
    expect(whatsapp.start).toHaveBeenCalledTimes(1);

    await registry.stopPlugin("chat");
    expect(whatsapp.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["connected", "healthy", "Chat SDK app running"],
    ["awaiting-pairing", "warning", "pairing code"],
    ["connecting", "warning", "connecting"],
    ["logged-out", "error", "logged out"],
  ] as const)(
    "reports a %s WhatsApp connection as %s",
    async (connection, status, message) => {
      const whatsapp = createFakeWhatsApp();
      await suite.harness.installPlugin(createWhatsAppPlugin(whatsapp));
      const registry = suite.harness.getMockShell().getDaemonRegistry();
      await registry.startPlugin("chat");
      whatsapp.setStatus(connection);
      const daemonName = registry.getByPlugin("chat")[0]?.name ?? "";

      const health = await registry.checkHealth(daemonName);

      expect(health?.status).toBe(status);
      expect(health?.message).toContain(message);
    },
  );

  it("answers a WhatsApp direct message in markdown on the same thread", async () => {
    await suite.harness.installPlugin(
      createWhatsAppPlugin(createFakeWhatsApp()),
    );
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: DM_THREAD,
      channelId: DM_THREAD,
      isDM: true,
      adapter: { name: "whatsapp" },
    });
    const message = createMessage({
      threadId: DM_THREAD,
      isMention: false,
      author: {
        userId: "31612345678",
        userName: "Mira",
        fullName: "Mira",
        isBot: false,
        isMe: false,
      },
    });

    await chat?.handlers.directMessages[0]?.(thread, message, thread);

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      `whatsapp-${DM_THREAD}`,
      expect.objectContaining({ interfaceType: "whatsapp" }),
    );
    expect(thread.post).toHaveBeenCalledWith({
      markdown: "Agent response text.",
    });
  });

  function groupThread(id = GROUP_THREAD): ReturnType<typeof createThread> {
    return createThread({
      id,
      channelId: id,
      isDM: false,
      adapter: { name: "whatsapp" },
    });
  }

  function groupMessage(isMention: boolean): ReturnType<typeof createMessage> {
    return createMessage({
      text: "What is next?",
      threadId: GROUP_THREAD,
      isMention,
      author: {
        userId: "31612345678",
        userName: "Mira",
        fullName: "Mira",
        isBot: false,
        isMe: false,
      },
    });
  }

  it("answers a mention in a group without taking over the group", async () => {
    await suite.harness.installPlugin(
      createWhatsAppPlugin(createFakeWhatsApp()),
    );
    const chat = MockChatSdk.instances[0];
    const thread = groupThread();

    await chat?.handlers.mentions[0]?.(thread, groupMessage(true));

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "What is next?",
      `whatsapp-${GROUP_THREAD}`,
      expect.objectContaining({ interfaceType: "whatsapp" }),
    );
    expect(thread.post).toHaveBeenCalledWith({
      markdown: "Agent response text.",
    });
    expect(thread.subscribe).not.toHaveBeenCalled();
  });

  it("leaves plain group messages alone while mentions are required", async () => {
    await suite.harness.installPlugin(
      createWhatsAppPlugin(createFakeWhatsApp()),
    );
    const chat = MockChatSdk.instances[0];
    const message = groupMessage(false);

    await Promise.all(
      (chat?.handlers.messagePatterns ?? [])
        .filter(({ pattern }) => pattern.test(message.text))
        .map(({ handler }) => handler(groupThread(), message)),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
  });

  it("answers only in the groups it is allowed in", async () => {
    const allowedGroup = "120363000000000001@g.us";
    await suite.harness.installPlugin(
      createWhatsAppPlugin(createFakeWhatsApp(), {
        allowedChannels: [allowedGroup],
      }),
    );
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(groupThread(), groupMessage(true));
    expect(suite.agentService.chat).not.toHaveBeenCalled();

    await chat?.handlers.mentions[0]?.(
      groupThread(`whatsapp:${allowedGroup}`),
      groupMessage(true),
    );
    expect(suite.agentService.chat).toHaveBeenCalledTimes(1);
  });
});
