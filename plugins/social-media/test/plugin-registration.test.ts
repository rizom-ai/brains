import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { SocialMediaPlugin } from "../src/plugin";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";

describe("SocialMediaPlugin - Publish Pipeline Registration", () => {
  let plugin: SocialMediaPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-social" });
    receivedMessages = [];

    // Capture publish:register messages
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
  });

  afterEach(async () => {
    mock.restore();
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with linkedin provider", async () => {
      plugin = new SocialMediaPlugin({
        linkedin: {
          accessToken: "test-token",
        },
      });
      await plugin.register(mockShell);

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "social-post",
      });
      // Verify provider is included
      expect(registerMessage?.payload).toHaveProperty(
        "provider.name",
        "linkedin",
      );
    });

    it("should not send publish:register if no providers configured", async () => {
      plugin = new SocialMediaPlugin({});
      await plugin.register(mockShell);

      // Should still register entity type but without provider
      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      // No provider configured, so no registration needed
      expect(registerMessage).toBeUndefined();
    });
  });

  describe("publish:execute subscription", () => {
    it("should subscribe to publish:execute messages", async () => {
      plugin = new SocialMediaPlugin({
        linkedin: { accessToken: "test-token" },
      });
      await plugin.register(mockShell);

      // Verify subscription works by sending a message and checking response
      const messageBus = mockShell.getMessageBus();
      const response = await messageBus.send(
        "publish:execute",
        { entityType: "social-post", entityId: "non-existent" },
        "test",
      );

      // Should get a response (even if entity not found), proving subscription exists
      expect(response).toMatchObject({ success: true });
    });
  });
});
