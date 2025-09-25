import "./mocks/setup";
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MatrixInterface } from "../src";
import { createInterfacePluginHarness } from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins";
import { PermissionService } from "@brains/permission-service";

// Access the global mocks
const mockMatrixClient = globalThis.mockMatrixClient;

describe("Matrix Interface - Channel Name Integration", () => {
  let matrixInterface: MatrixInterface;
  let harness: PluginTestHarness<MatrixInterface>;
  let startConversationMock: ReturnType<typeof mock>;
  let config: {
    homeserver: string;
    accessToken: string;
    userId: string;
  };

  beforeEach(async () => {
    // Reset mocks
    mockMatrixClient.getUserId.mockClear();
    mockMatrixClient.getRoomStateEvent.mockClear();

    config = {
      homeserver: "https://matrix.example.org",
      accessToken: "test-token",
      userId: "@bot:example.org",
    };

    // Create plugin harness
    harness = createInterfacePluginHarness<MatrixInterface>();

    // Configure mock shell with permissions
    const mockShell = harness.getShell();
    mockShell.getPermissionService = (): PermissionService => {
      return new PermissionService({
        anchors: ["matrix:@admin:example.org"],
        trusted: ["matrix:@trusted:example.org"],
      });
    };

    // Mock the conversation service's startConversation method
    startConversationMock = mock().mockResolvedValue("test-conversation-id");
    const originalGetConversationService =
      mockShell.getConversationService.bind(mockShell);
    mockShell.getConversationService = () => {
      const service = originalGetConversationService();
      service.startConversation = startConversationMock;
      service.addMessage = mock().mockResolvedValue(undefined);
      return service;
    };

    matrixInterface = new MatrixInterface(config);
    mockMatrixClient.getUserId.mockResolvedValue("@bot:example.org");
  });

  it("should fetch and pass room name when starting conversations", async () => {
    // Mock getRoomStateEvent to return a room name
    mockMatrixClient.getRoomStateEvent.mockResolvedValue({
      name: "Test Room",
    });

    await harness.installPlugin(matrixInterface);

    // Simulate a room message event
    const roomMessageHandler = mockMatrixClient.on.mock.calls.find(
      (call: unknown[]) => call[0] === "room.message",
    )?.[1] as ((roomId: string, event: unknown) => Promise<void>) | undefined;

    expect(roomMessageHandler).toBeDefined();

    // Simulate message from user
    const roomId = "!room123:example.org";
    const event = {
      sender: "@user:example.org",
      content: {
        msgtype: "m.text",
        body: "Hello bot",
      },
      event_id: "$event123",
    };

    // Process the message
    if (!roomMessageHandler) {
      throw new Error("Room message handler not registered");
    }
    await roomMessageHandler(roomId, event);

    // Small delay to allow async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify startConversation was called
    expect(startConversationMock).toHaveBeenCalled();
    const call = startConversationMock.mock.calls[0];
    expect(call).toBeDefined();

    // The metadata parameter should contain the room name
    const metadata = call?.[3] as { channelName?: string } | undefined; // Fourth parameter is metadata
    expect(metadata).toBeDefined();
    expect(metadata?.channelName).toBe("Test Room");

    // Verify getRoomStateEvent was called to fetch the name
    expect(mockMatrixClient.getRoomStateEvent).toHaveBeenCalledWith(
      roomId,
      "m.room.name",
      "",
    );
  });

  it("should fall back to room ID if room has no name", async () => {
    // Mock getRoomStateEvent to throw (room has no name)
    mockMatrixClient.getRoomStateEvent.mockRejectedValue(
      new Error("No room name"),
    );

    await harness.installPlugin(matrixInterface);

    // Simulate a room message event
    const roomMessageHandler = mockMatrixClient.on.mock.calls.find(
      (call: unknown[]) => call[0] === "room.message",
    )?.[1] as ((roomId: string, event: unknown) => Promise<void>) | undefined;

    const roomId = "!room456:example.org";
    const event = {
      sender: "@user:example.org",
      content: {
        msgtype: "m.text",
        body: "Hello bot",
      },
      event_id: "$event456",
    };

    // Process the message
    if (!roomMessageHandler) {
      throw new Error("Room message handler not registered");
    }
    await roomMessageHandler(roomId, event);

    // Small delay to allow async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify startConversation was called with room ID as fallback
    expect(startConversationMock).toHaveBeenCalled();
    const call = startConversationMock.mock.calls[0];
    expect(call).toBeDefined();

    const metadata = call?.[3] as { channelName?: string } | undefined;
    expect(metadata).toBeDefined();
    expect(metadata?.channelName).toBe(roomId); // Should use room ID as fallback
  });
});
