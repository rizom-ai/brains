import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { NewsletterPlugin } from "../src";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";
import type { Newsletter } from "../src/schemas/newsletter";

// Sample newsletter for testing
const sampleDraftNewsletter: Newsletter = {
  id: "test-newsletter-2024-01-01",
  entityType: "newsletter",
  content: "# Test Newsletter\n\nThis is a test newsletter content.",
  metadata: {
    subject: "Test Newsletter",
    status: "draft",
  },
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
};

describe("NewsletterPlugin - Publish Pipeline Integration", () => {
  let plugin: NewsletterPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({
      logger,
      dataDir: "/tmp/test-newsletter",
    });
    receivedMessages = [];

    // Capture publish messages
    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
    messageBus.subscribe("publish:report:success", async (msg) => {
      receivedMessages.push({
        type: "publish:report:success",
        payload: msg.payload,
      });
      return { success: true };
    });
    messageBus.subscribe("publish:report:failure", async (msg) => {
      receivedMessages.push({
        type: "publish:report:failure",
        payload: msg.payload,
      });
      return { success: true };
    });
  });

  afterEach(async () => {
    mock.restore();
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with buttondown provider", async () => {
      plugin = new NewsletterPlugin({
        buttondown: {
          apiKey: "test-api-key",
          doubleOptIn: false,
        },
      });
      await plugin.register(mockShell);

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "newsletter",
        provider: { name: "buttondown" },
      });
    });

    it("should send publish:register with internal provider when no buttondown config", async () => {
      plugin = new NewsletterPlugin({});
      await plugin.register(mockShell);

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "newsletter",
        provider: { name: "internal" },
      });
    });
  });

  describe("publish:execute handler", () => {
    it("should subscribe to publish:execute messages", async () => {
      plugin = new NewsletterPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      const response = await messageBus.send(
        "publish:execute",
        { entityType: "newsletter", entityId: "non-existent" },
        "test",
      );

      expect(response).toMatchObject({ success: true });
    });

    it("should report failure when entity not found", async () => {
      plugin = new NewsletterPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "newsletter", entityId: "non-existent" },
        "test",
      );

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
      expect(failureMessage?.payload).toMatchObject({
        entityType: "newsletter",
        entityId: "non-existent",
      });
    });

    it("should skip non-newsletter entity types", async () => {
      plugin = new NewsletterPlugin({});
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "post", entityId: "post-1" },
        "test",
      );

      // No report messages for other entity types
      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });

    it("should report success when publishing draft newsletter (internal provider)", async () => {
      plugin = new NewsletterPlugin({});
      await plugin.register(mockShell);

      // Add draft newsletter
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(sampleDraftNewsletter);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "newsletter", entityId: "test-newsletter-2024-01-01" },
        "test",
      );

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "newsletter",
        entityId: "test-newsletter-2024-01-01",
      });

      // Verify newsletter was updated to sent
      const updatedNewsletter = await entityService.getEntity<Newsletter>(
        "newsletter",
        "test-newsletter-2024-01-01",
      );
      expect(updatedNewsletter?.metadata.status).toBe("published");
      expect(updatedNewsletter?.metadata.sentAt).toBeDefined();
    });

    it("should skip already published newsletters", async () => {
      plugin = new NewsletterPlugin({});
      await plugin.register(mockShell);

      // Add published newsletter
      const publishedNewsletter: Newsletter = {
        ...sampleDraftNewsletter,
        metadata: {
          ...sampleDraftNewsletter.metadata,
          status: "published",
          sentAt: "2024-01-01T00:00:00Z",
        },
      };
      const entityService = mockShell.getEntityService();
      await entityService.createEntity(publishedNewsletter);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "newsletter", entityId: "test-newsletter-2024-01-01" },
        "test",
      );

      // No report messages for already published
      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });
  });
});
