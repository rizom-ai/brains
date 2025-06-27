import { describe, it, expect } from "bun:test";
import { matrixConfig } from "../src/config";

describe("MatrixConfig", () => {
  describe("Configuration", () => {
    it("should create valid config", () => {
      const config = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .build();

      expect(config).toBeDefined();
      expect(config.homeserver).toBe("https://matrix.example.org");
      expect(config.accessToken).toBe("test-token");
      expect(config.userId).toBe("@bot:example.org");
      expect(config.anchorUserId).toBe("@admin:example.org");
    });

    it("should fail with invalid config", () => {
      expect(() => {
        matrixConfig()
          .homeserver("not-a-url")
          .accessToken("test-token")
          .userId("@bot:example.org")
          .anchorUserId("@admin:example.org")
          .build();
      }).toThrow();
    });

    it("should fail with invalid user ID format", () => {
      expect(() => {
        matrixConfig()
          .homeserver("https://matrix.example.org")
          .accessToken("test-token")
          .userId("invalid-user-id")
          .anchorUserId("@admin:example.org")
          .build();
      }).toThrow();
    });
  });

  describe("ConfigBuilder", () => {
    it("should build config with all options", () => {
      const config = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .deviceId("DEVICE123")
        .deviceDisplayName("Test Bot")
        .storageDir("./test-storage")
        .cryptoStorageDir("./test-crypto")
        .trustedUsers(["@trusted1:example.org", "@trusted2:example.org"])
        .publicOnly(false)
        .autoJoin(true)
        .encryption(true)
        .reactions(true)
        .threading(true)
        .typingNotifications(true)
        .commandPrefix("!")
        .anchorPrefix("!!")
        .maxContext(20)
        .typingTimeout(30000)
        .reactionTimeout(60000)
        .perRoomRateLimit(10, 60000)
        .rateLimit(120)
        .retries(5, 2000)
        .build();

      expect(config.homeserver).toBe("https://matrix.example.org");
      expect(config.accessToken).toBe("test-token");
      expect(config.userId).toBe("@bot:example.org");
      expect(config.anchorUserId).toBe("@admin:example.org");
      expect(config.deviceId).toBe("DEVICE123");
      expect(config.deviceDisplayName).toBe("Test Bot");
      expect(config.storageDir).toBe("./test-storage");
      expect(config.cryptoStorageDir).toBe("./test-crypto");
      expect(config.trustedUsers).toEqual([
        "@trusted1:example.org",
        "@trusted2:example.org",
      ]);
      expect(config.publicToolsOnly).toBe(false);
      expect(config.autoJoinRooms).toBe(true);
      expect(config.enableEncryption).toBe(true);
      expect(config.enableReactions).toBe(true);
      expect(config.enableThreading).toBe(true);
      expect(config.enableTypingNotifications).toBe(true);
      expect(config.commandPrefix).toBe("!");
      expect(config.anchorPrefix).toBe("!!");
      expect(config.maxContextMessages).toBe(20);
      expect(config.typingTimeout).toBe(30000);
      expect(config.reactionTimeout).toBe(60000);
      expect(config.perRoomRateLimit).toEqual({ messages: 10, window: 60000 });
      expect(config.rateLimitPerMinute).toBe(120);
      expect(config.maxRetries).toBe(5);
      expect(config.retryDelay).toBe(2000);
    });

    it("should use defaults for optional fields", () => {
      const config = matrixConfig()
        .homeserver("https://matrix.example.org")
        .accessToken("test-token")
        .userId("@bot:example.org")
        .anchorUserId("@admin:example.org")
        .build();

      expect(config.publicToolsOnly).toBe(false);
      expect(config.autoJoinRooms).toBe(true);
      expect(config.enableEncryption).toBe(true);
      expect(config.enableReactions).toBe(true);
      expect(config.enableThreading).toBe(true);
      expect(config.enableTypingNotifications).toBe(true);
      expect(config.commandPrefix).toBe("!");
      expect(config.anchorPrefix).toBe("!!");
      expect(config.maxContextMessages).toBe(10);
      expect(config.typingTimeout).toBe(30000);
      expect(config.reactionTimeout).toBe(60000);
      expect(config.rateLimitPerMinute).toBe(60);
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelay).toBe(1000);
    });
  });
});
