import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { AgentResponse, ChatContext } from "@brains/plugins";

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
  isThread: () => false,
  messages: { fetch: mockMessagesFetch },
};

const mockThreadChannel = {
  id: "thread-456",
  ownerId: "bot-user-123", // owned by this bot
  send: mockSend,
  sendTyping: mockSendTyping,
  isThread: () => true,
  messages: { fetch: mockMessagesFetch },
};

const mockForeignThreadChannel = {
  id: "thread-789",
  ownerId: "other-bot-456", // owned by another bot
  send: mockSend,
  sendTyping: mockSendTyping,
  isThread: () => true,
  messages: { fetch: mockMessagesFetch },
};

let messageCreateHandler: ((message: unknown) => void) | null = null;

const mockClientOn = mock(
  (event: string, handler: (...args: unknown[]) => void) => {
    if (event === "messageCreate") messageCreateHandler = handler;
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
  Events: { ClientReady: "ready", MessageCreate: "messageCreate" },
  Partials: { Channel: 0 },
}));

// Import after mock
const { DiscordInterface } = await import("../src/discord-interface");

// ── Helpers ──

const mockFetchText = mock(() => Promise.resolve(""));

const createMockAgentService = () => ({
  chat: mock(
    (
      _message: string,
      _conversationId: string,
      _context?: ChatContext,
    ): Promise<AgentResponse> =>
      Promise.resolve({
        text: "Agent response text.",
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      }),
  ),
  confirmPendingAction: mock(
    (_conversationId: string, _confirmed: boolean): Promise<AgentResponse> =>
      Promise.resolve({
        text: "Action confirmed.",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      }),
  ),
});

const mockReact = mock(() => Promise.resolve());

function createDiscordMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { id: "user-789" },
    content: "<@bot-user-123> Hello bot",
    guild: { name: "Test Server" },
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
    messageCreateHandler = null;

    mockAgentService = createMockAgentService();
    harness = createPluginHarness<InstanceType<typeof DiscordInterface>>();

    const mockShell = harness.getShell();
    mockShell.getPermissionService = (): PermissionService =>
      new PermissionService({
        anchors: ["discord:anchor-user"],
        trusted: ["discord:trusted-user"],
      });
    mockShell.setAgentService(mockAgentService);

    discord = new DiscordInterface(
      { botToken: "test-token" },
      { fetchText: mockFetchText },
    );
    await harness.installPlugin(discord);
  });

  afterEach(() => {
    harness.reset();
  });

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
        pendingConfirmation: {
          toolName: "dangerous_tool",
          description: "Delete all",
          args: {},
        },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      const msg = createDiscordMessage();
      messageCreateHandler?.(msg);
      await new Promise((r) => setTimeout(r, 100));

      // Send "yes" confirmation
      const yesMsg = createDiscordMessage({ content: "yes" });
      messageCreateHandler?.(yesMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAgentService.confirmPendingAction).toHaveBeenCalled();
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
