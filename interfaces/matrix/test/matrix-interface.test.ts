import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { createPluginHarness, PermissionService } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { AgentResponse, ChatContext } from "@brains/plugins";

// ── Mock matrix-bot-sdk ──

const mockOn = mock(
  (_event: string, _handler: (roomId: string, event: unknown) => void) => {},
);
const mockOff = mock(
  (_event: string, _handler: (roomId: string, event: unknown) => void) => {},
);
const mockSendMessage = mock((_roomId: string, _content: unknown) =>
  Promise.resolve("event_123"),
);
const mockSetTyping = mock(
  (_roomId: string, _typing: boolean, _timeout: number) => Promise.resolve(),
);
const mockJoinRoom = mock((_roomId: string) =>
  Promise.resolve("!joined:example.org"),
);
const mockGetUserId = mock(() => Promise.resolve("@bot:example.org"));
const mockGetAccountData = mock(
  (): Promise<Record<string, string[]> | null> => Promise.resolve(null),
);
const mockDownloadContent = mock((_mxcUrl: string) =>
  Promise.resolve({
    data: Buffer.from(""),
    contentType: "application/octet-stream",
  }),
);
const mockSetupOnClient = mock(() => {});

const mockMatrixClient = {
  start: mock(() => Promise.resolve()),
  stop: mock(() => Promise.resolve()),
  on: mockOn,
  off: mockOff,
  sendMessage: mockSendMessage,
  sendTyping: mock(() => Promise.resolve()),
  setTyping: mockSetTyping,
  sendReaction: mock(() => Promise.resolve()),
  sendReply: mock(() => Promise.resolve("event_123")),
  sendFormattedMessage: mock(() => Promise.resolve("event_123")),
  joinRoom: mockJoinRoom,
  leaveRoom: mock(() => Promise.resolve()),
  getUserId: mockGetUserId,
  sendEvent: mock(() => Promise.resolve("event_123")),
  setDisplayName: mock(() => Promise.resolve()),
  getJoinedRooms: mock(() =>
    Promise.resolve(["!room1:example.org", "!room2:example.org"]),
  ),
  getRoomStateEvent: mock(() => Promise.resolve({})),
  getAccountData: mockGetAccountData,
  downloadContent: mockDownloadContent,
};

void mock.module("matrix-bot-sdk", () => ({
  MatrixClient: class MockMatrixClient {
    constructor() {
      return mockMatrixClient;
    }
  },
  AutojoinRoomsMixin: {
    setupOnClient: mockSetupOnClient,
  },
  SimpleFsStorageProvider: class MockStorageProvider {
    constructor() {}
  },
  LogLevel: {
    INFO: "info",
  },
  LogService: {
    setLogger: mock(() => {}),
    setLevel: mock(() => {}),
  },
  RichConsoleLogger: class MockLogger {},
}));

// Import after mock
const { MatrixInterface } = await import("../src");

// ── Helpers ──

const createMockAgentService = () => ({
  chat: mock(
    (
      _message: string,
      _conversationId: string,
      _context?: ChatContext,
    ): Promise<AgentResponse> =>
      Promise.resolve({
        text: "I found some results for you.",
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

function getHandler(event: string) {
  const call = mockOn.mock.calls.find((c) => c[0] === event);
  if (!call) throw new Error(`${event} handler not found`);
  return call[1];
}

// ── Tests ──

describe("MatrixInterface", () => {
  let config: {
    homeserver: string;
    accessToken: string;
    userId: string;
    [key: string]: unknown;
  };
  let harness: PluginTestHarness<InstanceType<typeof MatrixInterface>>;
  let mockAgentService: ReturnType<typeof createMockAgentService>;

  beforeEach(() => {
    // Reset mocks
    mockMatrixClient.start.mockClear();
    mockMatrixClient.stop.mockClear();
    mockOn.mockClear();
    mockOff.mockClear();
    mockSendMessage.mockClear();
    mockMatrixClient.sendTyping.mockClear();
    mockSetTyping.mockClear();
    mockJoinRoom.mockClear();
    mockMatrixClient.leaveRoom.mockClear();
    mockGetUserId.mockClear();
    mockMatrixClient.sendEvent.mockClear();
    mockMatrixClient.setDisplayName.mockClear();
    mockMatrixClient.getJoinedRooms.mockClear();
    mockMatrixClient.sendReaction.mockClear();
    mockMatrixClient.sendReply.mockClear();
    mockMatrixClient.sendFormattedMessage.mockClear();
    mockSetupOnClient.mockClear();
    mockGetAccountData.mockClear();
    mockDownloadContent.mockClear();

    config = {
      homeserver: "https://matrix.example.org",
      accessToken: "test-token",
      userId: "@bot:example.org",
    };

    mockAgentService = createMockAgentService();

    // Create plugin harness with permission configuration
    harness = createPluginHarness<InstanceType<typeof MatrixInterface>>();

    // Configure mock shell with permissions and agent service
    const mockShell = harness.getShell();
    mockShell.getPermissionService = (): PermissionService => {
      return new PermissionService({
        anchors: ["matrix:@admin:example.org"],
        trusted: ["matrix:@trusted:example.org"],
      });
    };
    mockShell.setAgentService(mockAgentService);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Initialization", () => {
    it("should create interface with valid config", () => {
      const matrixInterface = new MatrixInterface(config);
      expect(matrixInterface).toBeDefined();
    });

    it("should throw error for invalid config", () => {
      expect(() => {
        new MatrixInterface({});
      }).toThrow();
    });
  });

  describe("Lifecycle methods", () => {
    it("should register the interface and set up event handlers", async () => {
      const matrixInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      // Event handlers are registered during plugin registration
      expect(mockOn).toHaveBeenCalledWith("room.message", expect.any(Function));
    });

    it("should setup autojoin when enabled", async () => {
      const autoJoinConfig = {
        ...config,
        autoJoinRooms: true,
      };

      const matrixInterface = new MatrixInterface(autoJoinConfig);

      await harness.installPlugin(matrixInterface);

      // Auto-join is set up during client construction in registration
      expect(mockSetupOnClient).toHaveBeenCalled();
    });

    it("should provide daemon capability", async () => {
      const matrixInterface = new MatrixInterface(config);

      await harness.installPlugin(matrixInterface);

      // Interface plugins provide daemon capability
      expect(matrixInterface.type).toBe("interface");
    });
  });

  describe("Message handling with AgentService", () => {
    let matrixInterface: InstanceType<typeof MatrixInterface>;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      messageHandler = getHandler("room.message");
    });

    it("should send all messages to AgentService.chat()", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Hello, can you help me find something?",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should call AgentService.chat() with message, conversation ID, and permission level
      expect(mockAgentService.chat).toHaveBeenCalledWith(
        "Hello, can you help me find something?",
        "matrix-!room:example.org",
        {
          userPermissionLevel: "public",
          interfaceType: "matrix",
          channelId: "!room:example.org",
          channelName: "!room:example.org",
        },
      );
    });

    it("should not process commands - everything goes to agent", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "!help", // Old command format - should be sent to agent
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Even "commands" should go to the agent with permission context
      expect(mockAgentService.chat).toHaveBeenCalledWith(
        "!help",
        "matrix-!room:example.org",
        {
          userPermissionLevel: "public",
          interfaceType: "matrix",
          channelId: "!room:example.org",
          channelName: "!room:example.org",
        },
      );
    });

    it("should ignore own messages", async () => {
      const event = {
        sender: "@bot:example.org", // Bot's own message
        content: { msgtype: "m.text", body: "Hello" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Own messages should be ignored
      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should send typing indicator when processing message", async () => {
      const typingConfig = {
        ...config,
        enableTypingNotifications: true,
      };

      matrixInterface = new MatrixInterface(typingConfig);
      await harness.installPlugin(matrixInterface);

      messageHandler = getHandler("room.message");

      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Hello",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSetTyping).toHaveBeenCalledWith(
        "!room:example.org",
        true,
        expect.any(Number),
      );
    });

    it("should send formatted response from AgentService", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Search for notes about TypeScript",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should send the agent's response via sendMessage (sendFormattedMessage uses sendMessage internally)
      expect(mockSendMessage).toHaveBeenCalledWith(
        "!room:example.org",
        expect.objectContaining({
          body: "I found some results for you.",
          format: "org.matrix.custom.html",
        }),
      );
    });
  });

  describe("Confirmation flow", () => {
    let matrixInterface: InstanceType<typeof MatrixInterface>;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      // Set up agent to return pending confirmation
      mockAgentService.chat.mockResolvedValue({
        text: "I'll delete the note 'Meeting Notes'. Confirm? (yes/no)",
        pendingConfirmation: {
          toolName: "delete_note",
          description: "Delete note 'Meeting Notes'",
          args: { noteId: "123" },
        },
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      });

      // Update the mock agent service with the confirmation response
      harness.getShell().setAgentService(mockAgentService);

      matrixInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      messageHandler = getHandler("room.message");
    });

    it("should track pending confirmation from AgentService", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Delete my meeting notes",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should send the confirmation prompt via sendMessage
      expect(mockSendMessage).toHaveBeenCalledWith(
        "!room:example.org",
        expect.objectContaining({
          body: expect.stringContaining("Confirm?"),
          format: "org.matrix.custom.html",
        }),
      );
    });

    it("should call confirmPendingAction when user confirms", async () => {
      // First message triggers confirmation
      const deleteEvent = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Delete my meeting notes",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", deleteEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reset and set up confirmation response
      mockAgentService.chat.mockClear();
      mockAgentService.confirmPendingAction.mockResolvedValue({
        text: "Note deleted successfully.",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      // User confirms
      const confirmEvent = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "yes",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_124",
      };

      messageHandler("!room:example.org", confirmEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should call confirmPendingAction
      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        "matrix-!room:example.org",
        true,
      );
    });

    it("should call confirmPendingAction with false when user declines", async () => {
      // First message triggers confirmation
      const deleteEvent = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Delete my meeting notes",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", deleteEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reset and set up cancellation response
      mockAgentService.chat.mockClear();
      mockAgentService.confirmPendingAction.mockResolvedValue({
        text: "Action cancelled.",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      });

      // User declines
      const cancelEvent = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "no",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_124",
      };

      messageHandler("!room:example.org", cancelEvent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should call confirmPendingAction with false
      expect(mockAgentService.confirmPendingAction).toHaveBeenCalledWith(
        "matrix-!room:example.org",
        false,
      );
    });
  });

  describe("Direct messages and mentions", () => {
    let matrixInterface: InstanceType<typeof MatrixInterface>;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      messageHandler = getHandler("room.message");
    });

    it("should respond when bot is mentioned", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Hey @bot:example.org, can you help?",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should not respond when not mentioned in group chat", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Just chatting with someone else",
          // No mentions
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should respond in direct message room without mention", async () => {
      // Set up m.direct account data to indicate DM room
      const dmRoomId = "!dm-room:example.org";
      mockGetAccountData.mockResolvedValue({
        "@user:example.org": [dmRoomId],
      });

      // Reset harness and mocks to start fresh
      harness.reset();
      mockOn.mockClear();

      // Create new interface - DM rooms are loaded during registration
      const dmInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      // Reconfigure mock shell with agent service
      const mockShell = harness.getShell();
      mockShell.setAgentService(mockAgentService);

      await harness.installPlugin(dmInterface);

      const dmMessageHandler = getHandler("room.message");

      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Hello from DM",
          // No mention required in DM
        },
        event_id: "event_123",
      };

      dmMessageHandler(dmRoomId, event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should respond in DM even without mention
      expect(mockAgentService.chat).toHaveBeenCalled();
    });
  });

  describe("Room invite handling", () => {
    let matrixInterface: InstanceType<typeof MatrixInterface>;
    let inviteHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      const noAutoJoinConfig = {
        ...config,
        autoJoinRooms: false,
      };

      matrixInterface = new MatrixInterface(noAutoJoinConfig);

      await harness.installPlugin(matrixInterface);

      inviteHandler = getHandler("room.invite");
    });

    it("should accept invites from anchor user", async () => {
      const event = {
        sender: "@admin:example.org",
      };

      inviteHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockJoinRoom).toHaveBeenCalledWith("!room:example.org");
    });

    it("should ignore invites from non-anchor users", async () => {
      const event = {
        sender: "@random:example.org",
      };

      inviteHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockJoinRoom).not.toHaveBeenCalled();
    });
  });

  describe("File upload handling", () => {
    let matrixInterface: InstanceType<typeof MatrixInterface>;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      // Mock downloadContent to return file content
      mockDownloadContent.mockResolvedValue({
        data: Buffer.from("# My Notes\n\nSome content here"),
        contentType: "text/markdown",
      });

      await harness.installPlugin(matrixInterface);

      messageHandler = getHandler("room.message");
    });

    it("should handle m.file events from anchor users", async () => {
      const event = {
        sender: "@admin:example.org",
        content: {
          msgtype: "m.file",
          body: "notes.md",
          url: "mxc://example.org/abc123",
          info: {
            mimetype: "text/markdown",
            size: 500,
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should download the file and pass content to agent
      expect(mockDownloadContent).toHaveBeenCalledWith(
        "mxc://example.org/abc123",
      );
      expect(mockAgentService.chat).toHaveBeenCalledWith(
        expect.stringContaining("notes.md"),
        "matrix-!room:example.org",
        expect.objectContaining({
          interfaceType: "matrix",
        }),
      );
    });

    it("should handle m.file events from trusted users", async () => {
      const event = {
        sender: "@trusted:example.org",
        content: {
          msgtype: "m.file",
          body: "notes.md",
          url: "mxc://example.org/abc123",
          info: {
            mimetype: "text/markdown",
            size: 500,
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAgentService.chat).toHaveBeenCalled();
    });

    it("should reject m.file events from public users", async () => {
      const event = {
        sender: "@random:example.org",
        content: {
          msgtype: "m.file",
          body: "notes.md",
          url: "mxc://example.org/abc123",
          info: {
            mimetype: "text/markdown",
            size: 500,
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should ignore m.file events for non-text files", async () => {
      const event = {
        sender: "@admin:example.org",
        content: {
          msgtype: "m.file",
          body: "image.png",
          url: "mxc://example.org/abc123",
          info: {
            mimetype: "image/png",
            size: 500,
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should ignore m.file events for files that are too large", async () => {
      const event = {
        sender: "@admin:example.org",
        content: {
          msgtype: "m.file",
          body: "huge.md",
          url: "mxc://example.org/abc123",
          info: {
            mimetype: "text/markdown",
            size: 200_000,
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockAgentService.chat).not.toHaveBeenCalled();
    });

    it("should pass downloaded file content to agent", async () => {
      const event = {
        sender: "@admin:example.org",
        content: {
          msgtype: "m.file",
          body: "notes.md",
          url: "mxc://example.org/abc123",
          info: {
            mimetype: "text/markdown",
            size: 500,
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The agent should receive the file content
      const chatCall = mockAgentService.chat.mock.calls[0];
      const agentMessage = String(chatCall?.[0]);
      expect(agentMessage).toContain("# My Notes");
      expect(agentMessage).toContain("Some content here");
    });
  });

  describe("Error handling", () => {
    it("should handle AgentService errors gracefully", async () => {
      // Set up an error-throwing agent service BEFORE installing the plugin
      const errorAgentService = createMockAgentService();
      errorAgentService.chat.mockRejectedValue(new Error("Agent error"));
      harness.getShell().setAgentService(errorAgentService);

      const matrixInterface = new MatrixInterface(config);
      mockGetUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      const messageHandler = getHandler("room.message");

      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Hello",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      // Should not throw
      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should send error message to user via sendMessage
      expect(mockSendMessage).toHaveBeenCalledWith(
        "!room:example.org",
        expect.objectContaining({
          body: expect.stringContaining("Error"),
          format: "org.matrix.custom.html",
        }),
      );
    });
  });
});
