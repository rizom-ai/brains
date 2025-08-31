import { describe, it, expect } from "bun:test";
import { matrixConfigSchema } from "../src";

describe("MatrixConfig", () => {
  describe("Schema Validation", () => {
    it("should accept valid config with defaults", () => {
      const config = {
        homeserver: "https://matrix.example.org",
        accessToken: "test-token",
        userId: "@bot:example.org",
      };

      const result = matrixConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.homeserver).toBe("https://matrix.example.org");
        expect(result.data.accessToken).toBe("test-token");
        expect(result.data.userId).toBe("@bot:example.org");
      }
    });

    it("should reject invalid URL", () => {
      const config = {
        homeserver: "not-a-url",
        accessToken: "test-token",
        userId: "@bot:example.org",
      };

      const result = matrixConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should reject invalid user ID format", () => {
      const config = {
        homeserver: "https://matrix.example.org",
        accessToken: "test-token",
        userId: "invalid-user-id",
      };

      const result = matrixConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should validate partial config and apply schema defaults", () => {
      // Partial config as it would come from user
      const partialConfig = {
        homeserver: "https://matrix.example.org",
        accessToken: "test-token",
        userId: "@bot:example.org",
      };

      // Parse with schema defaults
      const result = matrixConfigSchema.parse(partialConfig);

      // Check schema defaults are applied
      expect(result.publicToolsOnly).toBe(false);
      expect(result.autoJoinRooms).toBe(true);
      expect(result.enableEncryption).toBe(true);
      expect(result.enableReactions).toBe(true);
      expect(result.enableThreading).toBe(true);
      expect(result.enableTypingNotifications).toBe(true);
      expect(result.commandPrefix).toBe("!");
      expect(result.maxContextMessages).toBe(10);
    });

    it("should accept config with all options", () => {
      const config = {
        homeserver: "https://matrix.example.org",
        accessToken: "test-token",
        userId: "@bot:example.org",
        deviceId: "DEVICE123",
        deviceDisplayName: "Test Bot",
        storageDir: "./test-storage",
        cryptoStorageDir: "./test-crypto",
        publicToolsOnly: false,
        autoJoinRooms: true,
        enableEncryption: true,
        enableReactions: true,
        enableThreading: true,
        enableTypingNotifications: true,
        commandPrefix: "!",
        maxContextMessages: 20,
        typingTimeout: 30000,
        reactionTimeout: 60000,
        perRoomRateLimit: { messages: 10, window: 60000 },
        rateLimitPerMinute: 120,
        maxRetries: 5,
        retryDelay: 2000,
      };

      const result = matrixConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceId).toBe("DEVICE123");
        expect(result.data.maxContextMessages).toBe(20);
      }
    });
  });
});
