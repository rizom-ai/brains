import "./mocks/setup";
import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { MatrixInterfaceV2 } from "../src/lib/matrix-interface-v2";
import { createInterfacePluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";
import { PermissionService } from "@brains/permission-service";
import type { IAgentService, AgentResponse } from "@brains/agent-service";

// Type for mock.on calls - [eventName, handler]
type MockOnCall = [string, (roomId: string, event: unknown) => void];

// Access the global mocks
const mockMatrixClient = globalThis.mockMatrixClient;
const mockAutoJoinMixin = globalThis.mockAutoJoinMixin;

// Mock AgentService
const createMockAgentService = (): IAgentService => ({
  chat: mock(
    (_message: string, _conversationId: string): Promise<AgentResponse> =>
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

describe("MatrixInterfaceV2", () => {
  let config: {
    homeserver: string;
    accessToken: string;
    userId: string;
    [key: string]: unknown;
  };
  let harness: PluginTestHarness<MatrixInterfaceV2>;
  let mockAgentService: IAgentService;

  beforeEach(() => {
    // Reset mocks
    mockMatrixClient.start.mockClear();
    mockMatrixClient.stop.mockClear();
    mockMatrixClient.on.mockClear();
    mockMatrixClient.off.mockClear();
    mockMatrixClient.sendMessage.mockClear();
    mockMatrixClient.sendTyping.mockClear();
    mockMatrixClient.setTyping.mockClear();
    mockMatrixClient.joinRoom.mockClear();
    mockMatrixClient.leaveRoom.mockClear();
    mockMatrixClient.getUserId.mockClear();
    mockMatrixClient.sendEvent.mockClear();
    mockMatrixClient.setDisplayName.mockClear();
    mockMatrixClient.getJoinedRooms.mockClear();
    mockMatrixClient.sendReaction.mockClear();
    mockMatrixClient.sendReply.mockClear();
    mockMatrixClient.sendFormattedMessage.mockClear();
    mockAutoJoinMixin.setupOnClient.mockClear();

    config = {
      homeserver: "https://matrix.example.org",
      accessToken: "test-token",
      userId: "@bot:example.org",
    };

    mockAgentService = createMockAgentService();

    // Create plugin harness with permission configuration
    harness = createInterfacePluginHarness<MatrixInterfaceV2>();

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
      const matrixInterface = new MatrixInterfaceV2(config);
      expect(matrixInterface).toBeDefined();
    });

    it("should throw error for invalid config", () => {
      expect(() => {
        new MatrixInterfaceV2(
          {} as unknown as ConstructorParameters<typeof MatrixInterfaceV2>[0],
        );
      }).toThrow();
    });
  });

  describe("Lifecycle methods", () => {
    it("should register the interface and set up event handlers", async () => {
      const matrixInterface = new MatrixInterfaceV2(config);
      mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      // Event handlers are registered during plugin registration
      expect(mockMatrixClient.on).toHaveBeenCalledWith(
        "room.message",
        expect.any(Function),
      );
    });

    it("should setup autojoin when enabled", async () => {
      const autoJoinConfig = {
        ...config,
        autoJoinRooms: true,
      };

      const matrixInterface = new MatrixInterfaceV2(autoJoinConfig);

      await harness.installPlugin(matrixInterface);

      // Auto-join is set up during client construction in registration
      expect(mockAutoJoinMixin.setupOnClient).toHaveBeenCalled();
    });

    it("should provide daemon capability", async () => {
      const matrixInterface = new MatrixInterfaceV2(config);

      await harness.installPlugin(matrixInterface);

      // Interface plugins provide daemon capability
      expect(matrixInterface.type).toBe("interface");
    });
  });

  describe("Message handling with AgentService", () => {
    let matrixInterface: MatrixInterfaceV2;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterfaceV2(config);
      mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      // Get the message handler that was registered
      const calls = mockMatrixClient.on.mock.calls as MockOnCall[];
      const messageCall = calls.find((call) => call[0] === "room.message");
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1];
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
        { userPermissionLevel: "public" },
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
        { userPermissionLevel: "public" },
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

      matrixInterface = new MatrixInterfaceV2(typingConfig);
      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls as MockOnCall[];
      const messageCall = calls.find((call) => call[0] === "room.message");
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1];

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

      expect(mockMatrixClient.setTyping).toHaveBeenCalledWith(
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
      expect(mockMatrixClient.sendMessage).toHaveBeenCalledWith(
        "!room:example.org",
        expect.objectContaining({
          body: "I found some results for you.",
          format: "org.matrix.custom.html",
        }),
      );
    });
  });

  describe("Confirmation flow", () => {
    let matrixInterface: MatrixInterfaceV2;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      // Set up agent to return pending confirmation
      mockAgentService.chat = mock(() =>
        Promise.resolve({
          text: "I'll delete the note 'Meeting Notes'. Confirm? (yes/no)",
          pendingConfirmation: {
            toolName: "delete_note",
            description: "Delete note 'Meeting Notes'",
            args: { noteId: "123" },
          },
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        }),
      );

      // Update the mock agent service with the confirmation response
      harness.getShell().setAgentService(mockAgentService);

      matrixInterface = new MatrixInterfaceV2(config);
      mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls as MockOnCall[];
      const messageCall = calls.find((call) => call[0] === "room.message");
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1];
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
      expect(mockMatrixClient.sendMessage).toHaveBeenCalledWith(
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

      // Reset mock for confirmation
      (mockAgentService.chat as ReturnType<typeof mock>).mockClear();
      mockAgentService.confirmPendingAction = mock(() =>
        Promise.resolve({
          text: "Note deleted successfully.",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
      );

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

      // Reset mock for cancellation
      (mockAgentService.chat as ReturnType<typeof mock>).mockClear();
      mockAgentService.confirmPendingAction = mock(() =>
        Promise.resolve({
          text: "Action cancelled.",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
      );

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
    let matrixInterface: MatrixInterfaceV2;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterfaceV2(config);
      mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls as MockOnCall[];
      const messageCall = calls.find((call) => call[0] === "room.message");
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1];
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
  });

  describe("Room invite handling", () => {
    let matrixInterface: MatrixInterfaceV2;
    let inviteHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      const noAutoJoinConfig = {
        ...config,
        autoJoinRooms: false,
      };

      matrixInterface = new MatrixInterfaceV2(noAutoJoinConfig);

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls as MockOnCall[];
      const inviteCall = calls.find((call) => call[0] === "room.invite");
      if (!inviteCall) throw new Error("Invite handler not found");
      inviteHandler = inviteCall[1];
    });

    it("should accept invites from anchor user", async () => {
      const event = {
        sender: "@admin:example.org",
      };

      inviteHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockMatrixClient.joinRoom).toHaveBeenCalledWith(
        "!room:example.org",
      );
    });

    it("should ignore invites from non-anchor users", async () => {
      const event = {
        sender: "@random:example.org",
      };

      inviteHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockMatrixClient.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should handle AgentService errors gracefully", async () => {
      // Set up an error-throwing agent service BEFORE installing the plugin
      const errorAgentService = createMockAgentService();
      errorAgentService.chat = mock(() =>
        Promise.reject(new Error("Agent error")),
      );
      harness.getShell().setAgentService(errorAgentService);

      const matrixInterface = new MatrixInterfaceV2(config);
      mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls as MockOnCall[];
      const messageCall = calls.find((call) => call[0] === "room.message");
      if (!messageCall) throw new Error("Message handler not found");
      const messageHandler = messageCall[1];

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
      expect(mockMatrixClient.sendMessage).toHaveBeenCalledWith(
        "!room:example.org",
        expect.objectContaining({
          body: expect.stringContaining("Error"),
          format: "org.matrix.custom.html",
        }),
      );
    });
  });
});
