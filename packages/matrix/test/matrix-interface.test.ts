import "./mocks/setup";
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { MatrixInterface } from "../src/matrix-interface";
import { matrixConfig } from "../src/config";
import type { InterfaceContext } from "@brains/interface-core";
import { createTestLogger } from "@brains/utils";
import type { MatrixConfig } from "../src/types";

// Access the global mocks
const mockMatrixClient = globalThis.mockMatrixClient;
const mockAutoJoinMixin = globalThis.mockAutoJoinMixin;

describe("MatrixInterface", () => {
  let mockContext: InterfaceContext;
  let config: MatrixConfig;

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
    mockAutoJoinMixin.setupOnClient.mockClear();

    mockContext = {
      name: "matrix",
      version: "1.0.0",
      logger: createTestLogger(),
      processQuery: mock(async () => "Mock response"),
    };

    config = matrixConfig()
      .homeserver("https://matrix.example.org")
      .accessToken("test-token")
      .userId("@bot:example.org")
      .anchorUserId("@admin:example.org")
      .build();
  });

  describe("Initialization", () => {
    it("should create interface with valid config", () => {
      const matrixInterface = new MatrixInterface(mockContext, config);
      expect(matrixInterface).toBeDefined();
    });

    it("should throw error for invalid context", () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new MatrixInterface(null as any, config);
      }).toThrow();
    });

    it("should throw error for invalid config", () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new MatrixInterface(mockContext, null as any);
      }).toThrow();
    });
  });

  describe("Lifecycle methods", () => {
    it("should start the interface", async () => {
      const matrixInterface = new MatrixInterface(mockContext, config);
      await matrixInterface.start();

      expect(mockMatrixClient.start).toHaveBeenCalled();
      expect(mockMatrixClient.on).toHaveBeenCalledWith(
        "room.message",
        expect.any(Function),
      );
    });

    it("should setup autojoin when enabled", async () => {
      const autoJoinConfig = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .autoJoin(true)
        .build();

      const matrixInterface = new MatrixInterface(mockContext, autoJoinConfig);
      await matrixInterface.start();

      expect(mockAutoJoinMixin.setupOnClient).toHaveBeenCalled();
    });

    it("should handle room invites when autojoin is disabled", async () => {
      const noAutoJoinConfig = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .autoJoin(false)
        .build();

      const matrixInterface = new MatrixInterface(
        mockContext,
        noAutoJoinConfig,
      );
      await matrixInterface.start();

      expect(mockMatrixClient.on).toHaveBeenCalledWith(
        "room.invite",
        expect.any(Function),
      );
    });

    it("should stop the interface", async () => {
      const matrixInterface = new MatrixInterface(mockContext, config);
      await matrixInterface.start();
      await matrixInterface.stop();

      expect(mockMatrixClient.stop).toHaveBeenCalled();
    });

    it("should handle stop when not started", async () => {
      const matrixInterface = new MatrixInterface(mockContext, config);
      // Just verify it doesn't throw
      await matrixInterface.stop();
      // No client should have been created
      expect(mockMatrixClient.stop).not.toHaveBeenCalled();
    });
  });

  describe("Message handling", () => {
    let matrixInterface: MatrixInterface;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      matrixInterface = new MatrixInterface(mockContext, config);
      await matrixInterface.start();

      // Get the message handler that was registered
      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1] as (roomId: string, event: unknown) => void;
    });

    it("should process valid messages", async () => {
      const event = {
        sender: "@user:example.org",
        content: { msgtype: "m.text", body: "Hello bot" },
        event_id: "event_123",
      };

      // Add a try-catch to see if there's an error
      try {
        messageHandler("!room:example.org", event);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error("Error in test:", error);
      }

      expect(mockContext.processQuery).toHaveBeenCalledWith(
        "Hello bot",
        expect.objectContaining({
          userId: "@user:example.org",
          channelId: "!room:example.org",
        }),
      );
    });

    it("should ignore own messages", async () => {
      const event = {
        sender: "@bot:example.org",
        content: { msgtype: "m.text", body: "Hello" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.processQuery).not.toHaveBeenCalled();
    });

    it("should handle command prefix", async () => {
      const event = {
        sender: "@user:example.org",
        content: { msgtype: "m.text", body: "!help" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.processQuery).toHaveBeenCalledWith(
        "!help",
        expect.any(Object),
      );
    });

    it("should handle anchor prefix for anchor user", async () => {
      const event = {
        sender: "@admin:example.org",
        content: { msgtype: "m.text", body: "!!admin-command" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.processQuery).toHaveBeenCalledWith(
        "!!admin-command",
        expect.any(Object),
      );
    });

    it("should ignore anchor commands from non-anchor users", async () => {
      const event = {
        sender: "@user:example.org",
        content: { msgtype: "m.text", body: "!!admin-command" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.processQuery).not.toHaveBeenCalled();
    });

    it("should send typing indicator when enabled", async () => {
      const typingConfig = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .typingNotifications(true)
        .build();

      matrixInterface = new MatrixInterface(mockContext, typingConfig);
      await matrixInterface.start();

      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1] as (roomId: string, event: unknown) => void;

      const event = {
        sender: "@user:example.org",
        content: { msgtype: "m.text", body: "Hello" },
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

    it("should handle errors gracefully", async () => {
      // Clear all mocks and handlers
      mockMatrixClient.sendMessage.mockClear();
      mockMatrixClient.on.mockClear();
      
      // Create a fresh interface with the error-throwing mock
      const errorContext = {
        name: "matrix",
        version: "1.0.0",
        logger: createTestLogger(),
        processQuery: mock(() =>
          Promise.reject(new Error("Processing failed")),
        ),
      };
      
      const errorInterface = new MatrixInterface(errorContext, config);
      await errorInterface.start();

      // Get the message handler
      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      const errorMessageHandler = messageCall[1] as (roomId: string, event: unknown) => void;

      const event = {
        sender: "@user:example.org",
        content: { msgtype: "m.text", body: "Hello" },
        event_id: "event_123",
      };

      errorMessageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMatrixClient.sendMessage).toHaveBeenCalledWith(
        "!room:example.org",
        expect.objectContaining({
          body: expect.stringContaining("Error:"),
        }),
      );
    });
  });

  describe("Permission handling", () => {
    let matrixInterface: MatrixInterface;
    let messageHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      const configWithTrusted = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .trustedUsers(["@trusted:example.org"])
        .build();

      matrixInterface = new MatrixInterface(mockContext, configWithTrusted);
      await matrixInterface.start();

      const calls = mockMatrixClient.on.mock.calls;
      const messageCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.message",
      );
      if (!messageCall) throw new Error("Message handler not found");
      messageHandler = messageCall[1] as (roomId: string, event: unknown) => void;
    });

    it("should identify anchor user correctly", async () => {
      const event = {
        sender: "@admin:example.org",
        content: { msgtype: "m.text", body: "test" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.processQuery).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({
          userId: "@admin:example.org",
        }),
      );
    });

    it("should identify trusted user correctly", async () => {
      const event = {
        sender: "@trusted:example.org",
        content: { msgtype: "m.text", body: "test" },
        event_id: "event_123",
      };

      messageHandler("!room:example.org", event);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockContext.processQuery).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({
          userId: "@trusted:example.org",
        }),
      );
    });
  });

  describe("Room invite handling", () => {
    let matrixInterface: MatrixInterface;
    let inviteHandler: (roomId: string, event: unknown) => void;

    beforeEach(async () => {
      const noAutoJoinConfig = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .autoJoin(false)
        .build();

      matrixInterface = new MatrixInterface(mockContext, noAutoJoinConfig);
      await matrixInterface.start();

      const calls = mockMatrixClient.on.mock.calls;
      const inviteCall = calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0] === "room.invite",
      );
      if (!inviteCall) throw new Error("Invite handler not found");
      inviteHandler = inviteCall[1] as (roomId: string, event: unknown) => void;
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
});
