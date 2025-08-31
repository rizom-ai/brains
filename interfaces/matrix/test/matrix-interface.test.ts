import "./mocks/setup";
import { describe, it, expect, beforeEach } from "bun:test";
import { MatrixInterface } from "../src";
import { createInterfacePluginHarness } from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins";
import { PermissionService } from "@brains/permission-service";

// Access the global mocks
const mockMatrixClient = globalThis.mockMatrixClient;
const mockAutoJoinMixin = globalThis.mockAutoJoinMixin;

describe("MatrixInterface", () => {
  let config: {
    homeserver: string;
    accessToken: string;
    userId: string;
    [key: string]: unknown;
  };
  let harness: PluginTestHarness<MatrixInterface>;

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

    // Create plugin harness with permission configuration
    harness = createInterfacePluginHarness<MatrixInterface>();

    // Configure mock shell with permissions
    const mockShell = harness.getShell();
    mockShell.getPermissionService = (): PermissionService => {
      return new PermissionService({
        anchors: ["matrix:@admin:example.org"],
        trusted: ["matrix:@trusted:example.org"],
      });
    };
  });

  describe("Initialization", () => {
    it("should create interface with valid config", () => {
      const matrixInterface = new MatrixInterface(config);
      expect(matrixInterface).toBeDefined();
    });

    it("should throw error for invalid config", () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new MatrixInterface({} as any);
      }).toThrow();
    });
  });

  describe("Lifecycle methods", () => {
    it("should register the interface and set up event handlers", async () => {
      const matrixInterface = new MatrixInterface(config);
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

      const matrixInterface = new MatrixInterface(autoJoinConfig);

      await harness.installPlugin(matrixInterface);

      // Auto-join is set up during client construction in registration
      expect(mockAutoJoinMixin.setupOnClient).toHaveBeenCalled();
    });

    it("should handle room invites when autojoin is disabled", async () => {
      const noAutoJoinConfig = {
        ...config,
        autoJoinRooms: false,
      };

      const matrixInterface = new MatrixInterface(noAutoJoinConfig);

      await harness.installPlugin(matrixInterface);

      // Event handlers are registered during plugin registration
      expect(mockMatrixClient.on).toHaveBeenCalledWith(
        "room.invite",
        expect.any(Function),
      );
    });

    it("should provide daemon capability", async () => {
      const matrixInterface = new MatrixInterface(config);

      await harness.installPlugin(matrixInterface);

      // Interface plugins provide daemon capability
      expect(matrixInterface.type).toBe("interface");
    });

    it("should handle multiple registrations gracefully", async () => {
      const matrixInterface = new MatrixInterface(config);
      mockMatrixClient.on.mockClear();

      await harness.installPlugin(matrixInterface);
      const firstCallCount = mockMatrixClient.on.mock.calls.length;

      // Reset and install again
      harness.reset();
      mockMatrixClient.on.mockClear();
      await harness.installPlugin(matrixInterface);

      // Should register event handlers again
      expect(mockMatrixClient.on.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe("Message handling", () => {
    let matrixInterface: MatrixInterface;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterface(config);
      mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");

      await harness.installPlugin(matrixInterface);

      // Get the message handler that was registered
      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1] as (
        roomId: string,
        event: unknown,
      ) => void;
    });

    it("should process valid messages", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "Hello bot",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      // Call the message handler and wait for processing
      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Note: Message processing is now internal to the interface
      // The client's setTyping method should be called
      expect(mockMatrixClient.setTyping).toHaveBeenCalled();
    });

    it("should ignore own messages", async () => {
      const event = {
        sender: "@bot:example.org",
        content: { msgtype: "m.text", body: "Hello" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Own messages are ignored, so no typing should be sent
      expect(mockMatrixClient.setTyping).not.toHaveBeenCalled();
    });

    it("should handle command prefix", async () => {
      const event = {
        sender: "@user:example.org",
        content: { msgtype: "m.text", body: "!help" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Commands are processed, so typing should be called
      expect(mockMatrixClient.setTyping).toHaveBeenCalled();
    });

    it("should use default processQuery without interface permission grants", async () => {
      // Create a fresh Matrix interface for this test
      const testInterface = new MatrixInterface(config);
      await harness.installPlugin(testInterface);

      // Matrix interface should not override processQuery method, meaning it inherits
      // the base implementation which does not grant interface permissions

      // Process a query and verify it completes successfully
      const result = await testInterface.processQuery("test query", {
        userId: "@user:example.org",
        channelId: "!room:example.org",
        messageId: "msg_123",
        timestamp: new Date(),
        interfaceType: "matrix",
        userPermissionLevel: "public",
      });

      // The result should be from the mock shell's generateContent method
      expect(result).toBe("Generated content for shell:knowledge-query");
    });

    it("should send typing indicator when enabled", async () => {
      const typingConfig = {
        ...config,
        enableTypingNotifications: true,
      };

      matrixInterface = new MatrixInterface(typingConfig);

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1] as (
        roomId: string,
        event: unknown,
      ) => void;

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
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockMatrixClient.setTyping).toHaveBeenCalledWith(
        "!room:example.org",
        true,
        expect.any(Number),
      );
    });
  });

  describe("User ID passing", () => {
    let matrixInterface: MatrixInterface;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterface(config);

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1] as (
        roomId: string,
        event: unknown,
      ) => void;
    });

    it("should pass userId and interfaceType to shell for permission determination", async () => {
      const event = {
        sender: "@user:example.org",
        content: {
          msgtype: "m.text",
          body: "!help",
          "m.mentions": {
            user_ids: ["@bot:example.org"],
          },
        },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The interface should process the message regardless of who sent it
      // Permission checks happen at the Shell level
      expect(mockMatrixClient.setTyping).toHaveBeenCalled();
    });
  });

  describe("Room invite handling", () => {
    let matrixInterface: MatrixInterface;
    let inviteHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      const noAutoJoinConfig = {
        ...config,
        autoJoinRooms: false,
      };

      matrixInterface = new MatrixInterface(noAutoJoinConfig);

      await harness.installPlugin(matrixInterface);

      const calls = mockMatrixClient.on.mock.calls;
      const inviteCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.invite",
      );
      if (!inviteCall) throw new Error("Invite handler not found");
      inviteHandler = inviteCall[1] as (roomId: string, event: unknown) => void;
    });

    it("should accept invites from anchor user (via centralized permissions)", async () => {
      const event = {
        sender: "@admin:example.org",
      };

      inviteHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The mock PermissionService is configured with @admin:example.org as anchor
      expect(mockMatrixClient.joinRoom).toHaveBeenCalledWith(
        "!room:example.org",
      );
    });

    it("should ignore invites from non-anchor users (via centralized permissions)", async () => {
      const event = {
        sender: "@random:example.org",
      };

      inviteHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The mock PermissionService doesn't have @random:example.org as anchor
      expect(mockMatrixClient.joinRoom).not.toHaveBeenCalled();
    });
  });
});
