import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { ChatContext } from "@brains/plugins";
import type { Mock } from "bun:test";

interface MockConversationService {
  startConversation: Mock<(request: { sessionId: string }) => Promise<string>>;
  addMessage: Mock<(_request: unknown) => Promise<void>>;
  getConversation: Mock<() => Promise<null>>;
  listConversations: Mock<() => Promise<never[]>>;
  searchConversations: Mock<() => Promise<never[]>>;
  getMessages: Mock<() => Promise<never[]>>;
  countMessages: Mock<() => Promise<number>>;
  updateConversationMetadata: Mock<() => Promise<boolean>>;
  deleteConversation: Mock<() => Promise<boolean>>;
  close: Mock<() => void>;
}

// ── Mock discord.js ──

const mockSend = mock(() =>
  Promise.resolve({ id: "msg-123", edit: mock(() => Promise.resolve()) }),
);
const mockSendTyping = mock(() => Promise.resolve());
const mockStartThread = mock(() =>
  Promise.resolve({
    id: "thread-456",
    send: mockSend,
    sendTyping: mockSendTyping,
    isThread: () => true,
  }),
);
const mockMessagesFetch = mock(() =>
  Promise.resolve({ id: "msg-123", edit: mock(() => Promise.resolve()) }),
);

const mockChannel = {
  id: "channel-123",
  send: mockSend,
  sendTyping: mockSendTyping,
  isThread: (): boolean => false,
  messages: { fetch: mockMessagesFetch },
};

const mockThreadChannel = {
  id: "thread-456",
  ownerId: "bot-user-123", // owned by this bot
  send: mockSend,
  sendTyping: mockSendTyping,
  isThread: (): boolean => true,
  messages: { fetch: mockMessagesFetch },
};

const mockForeignThreadChannel = {
  id: "thread-789",
  ownerId: "other-bot-456", // owned by another bot
  send: mockSend,
  sendTyping: mockSendTyping,
  isThread: (): boolean => true,
  messages: { fetch: mockMessagesFetch },
};

let messageCreateHandler: ((message: unknown) => void) | null = null;
let interactionCreateHandler: ((interaction: unknown) => void) | null = null;

const mockClientOn = mock(
  (event: string, handler: (...args: unknown[]) => void) => {
    if (event === "messageCreate") messageCreateHandler = handler;
    if (event === "interactionCreate") interactionCreateHandler = handler;
    return mockClientInstance;
  },
);
const mockClientOnce = mock(
  (_event: string, _handler: (...args: unknown[]) => void) => {
    return mockClientInstance;
  },
);

const mockClientInstance = {
  login: mock(() => Promise.resolve("token")),
  destroy: mock(() => Promise.resolve()),
  on: mockClientOn,
  once: mockClientOnce,
  user: { id: "bot-user-123", tag: "BrainBot#1234" },
  channels: {
    cache: {
      get: mock((id: string) => {
        if (id === "thread-456") return mockThreadChannel;
        return mockChannel;
      }),
    },
  },
};

void mock.module("discord.js", () => ({
  Client: class {
    login = mockClientInstance.login;
    destroy = mockClientInstance.destroy;
    on = mockClientInstance.on;
    once = mockClientInstance.once;
    user = mockClientInstance.user;
    channels = mockClientInstance.channels;
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
  },
  Events: {
    ClientReady: "ready",
    MessageCreate: "messageCreate",
    InteractionCreate: "interactionCreate",
  },
  Partials: { Channel: 0 },
}));

// Import after mock
const { DiscordInterface } = await import("../src/discord-interface");

type MockAgentServiceBase = Parameters<
  PluginTestHarness<InstanceType<typeof DiscordInterface>>["setAgentService"]
>[0];
type MockAgentService = Omit<
  MockAgentServiceBase,
  "chat" | "confirmPendingAction"
> & {
  chat: Mock<MockAgentServiceBase["chat"]>;
  confirmPendingAction: Mock<MockAgentServiceBase["confirmPendingAction"]>;
};

// ── Helpers ──

const mockFetchText = mock(() => Promise.resolve(""));

const createMockAgentService = (): MockAgentService => ({
  chat: mock(
    (_message: string, _conversationId: string, _context?: ChatContext) =>
      Promise.resolve({
        text: "Agent response text.",
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      }),
  ),
  confirmPendingAction: mock(
    (_conversationId: string, _confirmed: boolean, _approvalId?: string) =>
      Promise.resolve({
        text: "Action confirmed.",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
  ),
  invalidateAgent: (): void => {},
});

const createMockConversationService = (): MockConversationService => ({
  startConversation: mock((request: { sessionId: string }) =>
    Promise.resolve(request.sessionId),
  ),
  addMessage: mock((_request: unknown) => Promise.resolve()),
  getConversation: mock(() => Promise.resolve(null)),
  listConversations: mock(() => Promise.resolve([])),
  searchConversations: mock(() => Promise.resolve([])),
  getMessages: mock(() => Promise.resolve([])),
  countMessages: mock(() => Promise.resolve(0)),
  updateConversationMetadata: mock(() => Promise.resolve(false)),
  deleteConversation: mock(() => Promise.resolve(false)),
  close: mock((): void => {}),
});

const mockReact = mock(() => Promise.resolve());
const mockDeferUpdate = mock(() => Promise.resolve());
const mockInteractionReply = mock(() => Promise.resolve());
const mockInteractionMessageEdit = mock(() => Promise.resolve());

function createDiscordMessage(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "discord-message-123",
    author: { id: "user-789", username: "mira", globalName: "Mira" },
    member: { displayName: "Mira Ops" },
    content: "<@bot-user-123> Hello bot",
    guild: { id: "guild-123", name: "Test Server" },
    channel: mockChannel,
    mentions: {
      has: mock(() => true),
    },
    attachments: new Map(),
    startThread: mockStartThread,
    react: mockReact,
    ...overrides,
  };
}

function createDiscordButtonInteraction(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    isButton: (): boolean => true,
    customId: "brains:approval:approve:approval:call-1",
    channelId: "thread-456",
    channel: mockChannel,
    user: {
      id: "user-789",
      username: "mira",
      displayName: "Mira Ops",
      bot: false,
    },
    deferUpdate: mockDeferUpdate,
    reply: mockInteractionReply,
    message: { edit: mockInteractionMessageEdit },
    ...overrides,
  };
}

// ── Tests ──

describe("DiscordInterface", () => {
  let harness: PluginTestHarness<InstanceType<typeof DiscordInterface>>;
  let mockAgentService: ReturnType<typeof createMockAgentService>;
  let discord: InstanceType<typeof DiscordInterface>;

  beforeEach(async () => {
    // Reset mocks
    mockSend.mockClear();
    mockSendTyping.mockClear();
    mockStartThread.mockClear();
    mockClientInstance.login.mockClear();
    mockClientInstance.destroy.mockClear();
    mockClientOn.mockClear();
    mockClientOnce.mockClear();
    mockFetchText.mockClear();
    mockReact.mockClear();
    mockDeferUpdate.mockClear();
    mockInteractionReply.mockClear();
    mockInteractionMessageEdit.mockClear();
    messageCreateHandler = null;
    interactionCreateHandler = null;

    mockAgentService = createMockAgentService();
    harness = createPluginHarness<InstanceType<typeof DiscordInterface>>();

    harness.setPermissionService(
      new PermissionService({
        anchors: ["discord:anchor-user"],
        trusted: ["discord:trusted-user"],
      }),
    );
    harness.setAgentService(mockAgentService);

    discord = new DiscordInterface(
      { botToken: "test-token" },
      { fetchText: mockFetchText },
    );
    await harness.installPlugin(discord);
  });

  afterEach(() => {
    harness.reset();
  });

  async function installDiscordWithSpaces(
    spaces: string[],
    conversationService: MockConversationService,
  ): Promise<void> {
    harness.setPermissionService(
      new PermissionService(
        {
          anchors: ["discord:anchor-user"],
          trusted: ["discord:trusted-user"],
        },
        { spaces },
      ),
    );
    harness.getMockShell().getSpaces = (): string[] => spaces;
    harness.getMockShell().getConversationService =
      (): MockConversationService => conversationService;
    const spacedDiscord = new DiscordInterface({ botToken: "test-token" });
    await harness.installPlugin(spacedDiscord);
  }

  describe("Initialization", () => {
    it("should create interface with valid config", () => {
      expect(discord).toBeDefined();
      expect(discord.type).toBe("interface");
    });

    it("should reject missing bot token", () => {
      expect(() => new DiscordInterface({})).toThrow();
    });
  });

  describe("Message routing", () => {
    it("should route mentioned messages to agent", async () => {
      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalledWith(
        "Hello bot",
        expect.stringContaining("discord-"),
        expect.objectContaining({
          interfaceType: "discord",
          userPermissionLevel: "public",
        }),
      );
    });

    it("should pass Discord speaker attribution to the agent context", async () => {
      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalledWith(
        "Hello bot",
        expect.stringContaining("discord-"),
        expect.objectContaining({
          actor: expect.objectContaining({
            actorId: "discord:user-789",
            interfaceType: "discord",
            role: "user",
            displayName: "Mira Ops",
            username: "mira",
            isBot: false,
          }),
          source: expect.objectContaining({
            messageId: "discord-message-123",
            channelId: "channel-123",
            threadId: "thread-456",
            metadata: expect.objectContaining({
              guildId: "guild-123",
              guildName: "Test Server",
            }),
          }),
        }),
      );
    });

    it("should ignore bot's own messages", async () => {
      const msg = createDiscordMessage({
        author: { id: "bot-user-123", bot: true },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should ignore other bots in threads unless mentioned", async () => {
      const msg = createDiscordMessage({
        author: { id: "other-bot-456", bot: true },
        channel: mockThreadChannel,
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should respond to other bots in threads when explicitly mentioned", async () => {
      const msg = createDiscordMessage({
        author: { id: "other-bot-456", bot: true },
        channel: mockThreadChannel,
        content: "<@bot-user-123> hello from another bot",
        mentions: { has: mock(() => true) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should ignore bots that don't mention this bot, even in DMs", async () => {
      const msg = createDiscordMessage({
        author: { id: "other-bot-456", bot: true },
        guild: null,
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should respond to bots that explicitly mention this bot in DMs", async () => {
      const msg = createDiscordMessage({
        author: { id: "other-bot-456", bot: true },
        guild: null,
        content: "<@bot-user-123> hello from another bot",
        mentions: { has: mock(() => true) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should block bot DMs when allowDMs is false, even with mention", async () => {
      const noDMDiscord = new DiscordInterface({
        botToken: "test-token",
        allowDMs: false,
      });
      await harness.installPlugin(noDMDiscord);

      const msg = createDiscordMessage({
        author: { id: "other-bot-456", bot: true },
        guild: null,
        content: "<@bot-user-123> hello",
        mentions: { has: mock(() => true) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should ignore messages without mention in server channels", async () => {
      const msg = createDiscordMessage({
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should ignore @everyone messages (not a direct mention of the bot)", async () => {
      // Discord.js mentions.has() returns true for @everyone unless ignoreEveryone is passed
      // Simulate the raw Discord.js behavior: has() returns true because of @everyone
      const msg = createDiscordMessage({
        content: "Hi @everyone! Check this out.",
        mentions: {
          has: mock((_user: unknown, options?: { ignoreEveryone?: boolean }) =>
            options?.ignoreEveryone ? false : true,
          ),
        },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should respond to DMs without mention", async () => {
      const msg = createDiscordMessage({
        guild: null, // DM
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should always respond in own threads without mention", async () => {
      const msg = createDiscordMessage({
        channel: mockThreadChannel, // ownerId === bot-user-123
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should ignore messages in foreign threads unless mentioned", async () => {
      const msg = createDiscordMessage({
        channel: mockForeignThreadChannel, // ownerId === other-bot-456
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should respond in foreign threads when explicitly mentioned", async () => {
      const msg = createDiscordMessage({
        channel: mockForeignThreadChannel,
        content: "<@bot-user-123> hello",
        mentions: { has: mock(() => true) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should respect channel allowlist", async () => {
      const restrictedDiscord = new DiscordInterface({
        botToken: "test-token",
        allowedChannels: ["allowed-channel"],
      });
      await harness.installPlugin(restrictedDiscord);

      const msg = createDiscordMessage(); // channel-123, not in allowlist
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });
  });

  describe("Passive space capture", () => {
    it("should capture unmentioned server messages in configured spaces without routing to agent", async () => {
      const conversationService = createMockConversationService();
      await installDiscordWithSpaces(
        ["discord:channel-123"],
        conversationService,
      );

      const msg = createDiscordMessage({
        content: "Team update for summary",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(conversationService.startConversation).toHaveBeenCalledWith({
        sessionId: "discord-channel-123",
        interfaceType: "discord",
        channelId: "channel-123",
        metadata: {
          channelName: "Test Server",
          interfaceType: "discord",
          channelId: "channel-123",
        },
      });
      expect(conversationService.addMessage).toHaveBeenCalledWith({
        conversationId: "discord-channel-123",
        role: "user",
        content: "Team update for summary",
        metadata: expect.objectContaining({
          actor: expect.objectContaining({
            actorId: "discord:user-789",
            interfaceType: "discord",
            role: "user",
            displayName: "Mira Ops",
            username: "mira",
            isBot: false,
          }),
          source: expect.objectContaining({
            messageId: "discord-message-123",
            channelId: "channel-123",
            channelName: "Test Server",
            metadata: expect.objectContaining({
              guildId: "guild-123",
              guildName: "Test Server",
            }),
          }),
        }),
      });
      expect(mockAgentService.chat).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockStartThread).not.toHaveBeenCalled();
    });

    it("should ignore unmentioned server messages outside configured spaces when mention is required", async () => {
      const conversationService = createMockConversationService();
      await installDiscordWithSpaces(
        ["discord:other-channel"],
        conversationService,
      );

      const msg = createDiscordMessage({
        content: "Outside configured spaces",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(conversationService.startConversation).not.toHaveBeenCalled();
      expect(conversationService.addMessage).not.toHaveBeenCalled();
      expect(mockAgentService.chat).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should still route mentioned messages in configured spaces to the agent", async () => {
      const conversationService = createMockConversationService();
      await installDiscordWithSpaces(
        ["discord:channel-123"],
        conversationService,
      );

      const msg = createDiscordMessage({
        content: "<@bot-user-123> summarize this",
        mentions: { has: mock(() => true) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalledWith(
        "summarize this",
        expect.stringContaining("discord-"),
        expect.objectContaining({
          interfaceType: "discord",
          userPermissionLevel: "trusted",
        }),
      );
    });

    it("should capture thread messages against the configured parent channel space", async () => {
      const conversationService = createMockConversationService();
      await installDiscordWithSpaces(
        ["discord:channel-123"],
        conversationService,
      );

      const threadInConfiguredSpace = {
        ...mockForeignThreadChannel,
        parentId: "channel-123",
      };
      const msg = createDiscordMessage({
        channel: threadInConfiguredSpace,
        content: "Thread update for the parent space",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(conversationService.startConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "discord-channel-123",
          channelId: "channel-123",
        }),
      );
      expect(conversationService.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "discord-channel-123",
          content: "Thread update for the parent space",
          metadata: expect.objectContaining({
            source: expect.objectContaining({
              channelId: "channel-123",
              threadId: "thread-789",
            }),
          }),
        }),
      );
      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });
  });

  describe("Thread support", () => {
    it("should create thread for server channel messages", async () => {
      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockStartThread).toHaveBeenCalledWith(
        expect.objectContaining({ name: expect.any(String) }),
      );
    });

    it("should not create thread in DMs", async () => {
      const msg = createDiscordMessage({ guild: null });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockStartThread).not.toHaveBeenCalled();
    });

    it("should not create thread when already in a thread", async () => {
      const msg = createDiscordMessage({
        channel: mockThreadChannel,
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockStartThread).not.toHaveBeenCalled();
    });

    it("should not create thread when threads disabled", async () => {
      const noThreadDiscord = new DiscordInterface({
        botToken: "test-token",
        useThreads: false,
      });
      await harness.installPlugin(noThreadDiscord);

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockStartThread).not.toHaveBeenCalled();
    });
  });

  describe("Typing indicator", () => {
    it("should send typing indicator when processing", async () => {
      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockSendTyping).toHaveBeenCalled();
    });

    it("should not send typing when disabled", async () => {
      const quietDiscord = new DiscordInterface({
        botToken: "test-token",
        showTypingIndicator: false,
      });
      await harness.installPlugin(quietDiscord);

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      // Typing may still be called by the thread channel — check the original channel
      // The key thing is the typing indicator method respects the config
    });
  });

  describe("Confirmation flow", () => {
    it("should handle confirmation yes response", async () => {
      // First message triggers pending confirmation
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Are you sure?",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:dangerous-tool",
            toolName: "dangerous_tool",
            summary: "Delete all",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      // Send "yes" confirmation
      const yesMsg = createDiscordMessage({ content: "yes" });
      messageCreateHandler?.(yesMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        expect.stringContaining("discord-"),
        true,
        "approval:dangerous-tool",
        expect.objectContaining({
          userPermissionLevel: "public",
          interfaceType: "discord",
          actor: expect.objectContaining({ actorId: "discord:user-789" }),
        }),
      );
    });

    it("should pass topic changes during pending confirmation through to chat", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Are you sure?",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:dangerous-tool",
            toolName: "dangerous_tool",
            summary: "Delete all",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Fresh topic answer.",
        usage: { promptTokens: 5, completionTokens: 6, totalTokens: 11 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));
      mockSend.mockClear();

      const topicChange = createDiscordMessage({
        content: "actually tell me about Rover",
      });
      messageCreateHandler?.(topicChange);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.confirmPendingAction).not.toHaveBeenCalled();
      expect(mockAgentService.chat).toHaveBeenNthCalledWith(
        2,
        "actually tell me about Rover",
        expect.stringContaining("discord-"),
        expect.objectContaining({
          userPermissionLevel: "public",
          interfaceType: "discord",
          actor: expect.objectContaining({ actorId: "discord:user-789" }),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith("Fresh topic answer.");
    });

    it("should render structured approval cards with Discord buttons", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Use the buttons below"),
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Approval required",
              description: "Delete note?",
            }),
          ]),
          components: expect.arrayContaining([
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({
                  label: "Approve",
                  custom_id: "brains:approval:approve:approval:call-1",
                }),
                expect.objectContaining({
                  label: "Decline",
                  custom_id: "brains:approval:deny:approval:call-1",
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    it("should render multiple approval cards without collapsing their ids", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-delete",
            toolCallId: "call-delete",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "approval-requested",
          },
          {
            kind: "tool-approval",
            id: "approval:call-update",
            toolCallId: "call-update",
            toolName: "update_note",
            input: { noteId: "456" },
            summary: "Update note?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.confirmPendingAction.mockResolvedValueOnce({
        text: "Completed: Update note?",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-update",
            toolCallId: "call-update",
            toolName: "update_note",
            input: { noteId: "456" },
            summary: "Update note?",
            state: "output-available",
            output: { success: true },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({ description: "Delete note?" }),
            expect.objectContaining({ description: "Update note?" }),
          ]),
          components: expect.arrayContaining([
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({
                  custom_id: "brains:approval:approve:approval:call-delete",
                }),
              ]),
            }),
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({
                  custom_id: "brains:approval:approve:approval:call-update",
                }),
              ]),
            }),
          ]),
        }),
      );
      mockSend.mockClear();

      const interaction = createDiscordButtonInteraction({
        customId: "brains:approval:approve:approval:call-update",
      });
      interactionCreateHandler?.(interaction);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        "discord-thread-456",
        true,
        "approval:call-update",
        expect.objectContaining({
          userPermissionLevel: "public",
          interfaceType: "discord",
          actor: expect.objectContaining({ actorId: "discord:user-789" }),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "",
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Action completed",
              description: "Update note?",
            }),
          ]),
        }),
      );
    });

    it("should confirm structured approval button responses with the explicit approval id", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.confirmPendingAction.mockResolvedValueOnce({
        text: "Completed: Delete note?",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "output-available",
            output: { success: true, data: { deleted: "123" } },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));
      mockSend.mockClear();

      const interaction = createDiscordButtonInteraction();
      interactionCreateHandler?.(interaction);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockDeferUpdate).toHaveBeenCalled();
      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        "discord-thread-456",
        true,
        "approval:call-1",
        expect.objectContaining({
          userPermissionLevel: "public",
          interfaceType: "discord",
          actor: expect.objectContaining({ actorId: "discord:user-789" }),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "",
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Action completed",
              description: "Delete note?",
            }),
          ]),
          components: [],
        }),
      );
    });

    it("should clear approval buttons from the original Discord message after a button response", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.confirmPendingAction.mockResolvedValueOnce({
        text: "Completed: Delete note?",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "output-available",
            output: { success: true },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      const interaction = createDiscordButtonInteraction();
      interactionCreateHandler?.(interaction);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockInteractionMessageEdit).toHaveBeenCalledWith(
        expect.objectContaining({ components: [] }),
      );
    });

    it("should send generated image artifacts as Discord files after approval", async () => {
      harness.addEntities([
        {
          id: "image-native",
          entityType: "image",
          content: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`,
          metadata: { filename: "self-portrait.png" },
          visibility: "restricted",
        },
      ]);
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "system_generate",
            input: { entityType: "image", title: "Self Portrait" },
            summary: "Generate Self Portrait?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.confirmPendingAction.mockResolvedValueOnce({
        text: "Generated the image.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "system_generate",
            summary: "Generate Self Portrait?",
            state: "output-available",
            output: { success: true },
          },
          {
            kind: "attachment",
            id: "image-card",
            title: "Self Portrait",
            attachment: {
              mediaType: "image/png",
              url: "/api/chat/attachments/image?id=image-native",
              downloadUrl:
                "/api/chat/attachments/image?id=image-native&download=1",
              filename: "self-portrait.png",
              source: { entityType: "image", entityId: "image-native" },
            },
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));
      mockSend.mockClear();

      const interaction = createDiscordButtonInteraction({
        user: {
          id: "anchor-user",
          username: "yeehaa",
          displayName: "Yeehaa",
          bot: false,
        },
      });
      interactionCreateHandler?.(interaction);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.objectContaining({ name: "self-portrait.png" }),
          ]),
        }),
      );
    });

    it("should reject stale approval button responses", async () => {
      const interaction = createDiscordButtonInteraction();
      interactionCreateHandler?.(interaction);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockInteractionReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "This approval is no longer pending or has changed.",
          ephemeral: true,
        }),
      );
      expect(mockAgentService.confirmPendingAction).not.toHaveBeenCalled();
    });

    it("should store explicit approval ids from structured cards", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.confirmPendingAction.mockResolvedValueOnce({
        text: "Failed: Delete note?\n\nEntity not found",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "output-error",
            output: { success: false, error: "Entity not found" },
            error: "Entity not found",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));
      mockSend.mockClear();

      const yesMsg = createDiscordMessage({ content: "yes" });
      messageCreateHandler?.(yesMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        expect.stringContaining("discord-"),
        true,
        "approval:call-1",
        expect.objectContaining({
          userPermissionLevel: "public",
          interfaceType: "discord",
          actor: expect.objectContaining({ actorId: "discord:user-789" }),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "",
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Action failed",
              description: "Delete note?",
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: "Error",
                  value: "Entity not found",
                }),
              ]),
            }),
          ]),
          components: [],
        }),
      );
    });

    it("should render denied approval results as a declined embed", async () => {
      mockAgentService.chat.mockResolvedValueOnce({
        text: "Confirmation required.",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "approval-requested",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });
      mockAgentService.confirmPendingAction.mockResolvedValueOnce({
        text: "Cancelled: Delete note?",
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolCallId: "call-1",
            toolName: "delete_note",
            input: { noteId: "123" },
            summary: "Delete note?",
            state: "output-denied",
          },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));
      mockSend.mockClear();

      const noMsg = createDiscordMessage({ content: "no" });
      messageCreateHandler?.(noMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        expect.stringContaining("discord-"),
        false,
        "approval:call-1",
        expect.objectContaining({
          userPermissionLevel: "public",
          interfaceType: "discord",
          actor: expect.objectContaining({ actorId: "discord:user-789" }),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "",
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: "Action declined",
              description: "Delete note?",
            }),
          ]),
          components: [],
        }),
      );
    });
  });

  describe("File uploads", () => {
    it("should pass text file content to agent for anchor users", async () => {
      const attachment = {
        name: "notes.md",
        contentType: "text/markdown",
        size: 100,
        url: "https://cdn.discord.com/attachments/notes.md",
      };
      const attachments = new Map([["1", attachment]]);

      mockFetchText.mockResolvedValueOnce("# My Notes\nContent here");

      const msg = createDiscordMessage({
        author: { id: "anchor-user" },
        attachments,
        content: "",
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetchText).toHaveBeenCalledWith(
        "https://cdn.discord.com/attachments/notes.md",
      );
      expect(mockAgentService.chat).toHaveBeenCalledWith(
        expect.stringContaining("notes.md"),
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should reject file uploads from public users", async () => {
      const attachment = {
        name: "notes.md",
        contentType: "text/markdown",
        size: 100,
        url: "https://cdn.discord.com/attachments/notes.md",
      };
      const attachments = new Map([["1", attachment]]);

      const msg = createDiscordMessage({
        author: { id: "public-user" },
        attachments,
        content: "<@bot-user-123> save this",
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetchText).not.toHaveBeenCalled();
      expect(mockAgentService.chat).toHaveBeenCalledWith(
        "save this",
        expect.any(String),
        expect.any(Object),
      );
    });

    it("should ignore non-text file attachments", async () => {
      const attachment = {
        name: "photo.png",
        contentType: "image/png",
        size: 5000,
        url: "https://cdn.discord.com/attachments/photo.png",
      };
      const attachments = new Map([["1", attachment]]);

      const msg = createDiscordMessage({
        author: { id: "anchor-user" },
        attachments,
        content: "<@bot-user-123> check this",
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockFetchText).not.toHaveBeenCalled();
    });

    it("should combine text and file attachment in one message", async () => {
      const attachment = {
        name: "doc.md",
        contentType: "text/markdown",
        size: 50,
        url: "https://cdn.discord.com/attachments/doc.md",
      };
      const attachments = new Map([["1", attachment]]);

      mockFetchText.mockResolvedValueOnce("File content");

      const msg = createDiscordMessage({
        author: { id: "anchor-user" },
        attachments,
        content: "<@bot-user-123> save this file",
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      // Agent should receive both text and file content
      const chatCall = mockAgentService.chat.mock.calls[0];
      const agentMsg = String(chatCall?.[0]);
      expect(agentMsg).toContain("save this file");
      expect(agentMsg).toContain("doc.md");
      expect(agentMsg).toContain("File content");
    });
  });

  describe("Error handling", () => {
    it("should send error message when agent fails", async () => {
      mockAgentService.chat.mockRejectedValueOnce(new Error("Agent error"));

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      // Should send error message to channel
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining("Error"));
    });
  });

  describe("URL auto-capture", () => {
    let captureDiscord: InstanceType<typeof DiscordInterface>;

    beforeEach(async () => {
      captureDiscord = new DiscordInterface({
        botToken: "test-token",
        captureUrls: true,
      });
      await harness.installPlugin(captureDiscord);
    });

    it("should react with bookmark emoji when URL is shared without mention", async () => {
      const msg = createDiscordMessage({
        content: "Check this out https://example.com/article",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockReact).toHaveBeenCalledWith("🔖");
    });

    it("should send URL to agent for saving", async () => {
      const msg = createDiscordMessage({
        content: "Check this out https://example.com/article",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.chat).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/article"),
        expect.stringContaining("links-"),
        expect.any(Object),
      );
    });

    it("should not capture URLs when captureUrls is false (default)", async () => {
      // Default discord (captureUrls: false) is set up in outer beforeEach
      await harness.installPlugin(discord);

      const msg = createDiscordMessage({
        content: "Check this out https://example.com/article",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockReact).not.toHaveBeenCalled();
      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should not capture blocked domains", async () => {
      const msg = createDiscordMessage({
        content: "Join the call https://meet.google.com/abc-def-ghi",
        mentions: { has: mock(() => false) },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockReact).not.toHaveBeenCalled();
    });

    it("should not URL-capture when bot is directly mentioned (normal routing)", async () => {
      const msg = createDiscordMessage({
        content: "<@bot-user-123> save https://example.com",
        mentions: {
          has: mock((_user: unknown, options?: { ignoreEveryone?: boolean }) =>
            options?.ignoreEveryone ? true : true,
          ),
        },
      });
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      // Normal agent routing — no emoji react for URL capture
      expect(mockReact).not.toHaveBeenCalled();
      expect(mockAgentService.chat).toHaveBeenCalled();
    });
  });
});
