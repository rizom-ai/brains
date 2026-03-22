import { describe, it, expect, beforeEach } from "bun:test";
import { NewsletterPlugin } from "../src";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { Newsletter } from "../src/schemas/newsletter";

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
  let harness: PluginTestHarness<NewsletterPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter",
    });
    receivedMessages = [];

    for (const eventType of [
      "publish:register",
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("provider registration", () => {
    it("should send publish:register after system:plugins:ready with buttondown provider", async () => {
      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: { apiKey: "test-api-key", doubleOptIn: false },
        }),
      );

      await harness.sendMessage(
        "system:plugins:ready",
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "newsletter",
        provider: { name: "buttondown" },
      });
    });

    it("should send publish:register with internal provider after system:plugins:ready when no buttondown config", async () => {
      await harness.installPlugin(new NewsletterPlugin({}));

      await harness.sendMessage(
        "system:plugins:ready",
        { timestamp: new Date().toISOString(), pluginCount: 1 },
        "shell",
        true,
      );

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
      await harness.installPlugin(new NewsletterPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "newsletter",
        entityId: "non-existent",
      });

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
    });

    it("should report failure when entity not found", async () => {
      await harness.installPlugin(new NewsletterPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "newsletter",
        entityId: "non-existent",
      });

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
      await harness.installPlugin(new NewsletterPlugin({}));

      await harness.sendMessage("publish:execute", {
        entityType: "post",
        entityId: "post-1",
      });

      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });

    it("should report success when publishing draft newsletter (internal provider)", async () => {
      await harness.installPlugin(new NewsletterPlugin({}));

      const entityService = harness.getEntityService();
      await entityService.createEntity(sampleDraftNewsletter);

      await harness.sendMessage("publish:execute", {
        entityType: "newsletter",
        entityId: "test-newsletter-2024-01-01",
      });

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "newsletter",
        entityId: "test-newsletter-2024-01-01",
      });

      const updatedNewsletter = await entityService.getEntity<Newsletter>(
        "newsletter",
        "test-newsletter-2024-01-01",
      );
      expect(updatedNewsletter?.metadata.status).toBe("published");
      expect(updatedNewsletter?.metadata.sentAt).toBeDefined();
    });

    it("should skip already published newsletters", async () => {
      await harness.installPlugin(new NewsletterPlugin({}));

      const publishedNewsletter: Newsletter = {
        ...sampleDraftNewsletter,
        metadata: {
          ...sampleDraftNewsletter.metadata,
          status: "published",
          sentAt: "2024-01-01T00:00:00Z",
        },
      };
      const entityService = harness.getEntityService();
      await entityService.createEntity(publishedNewsletter);

      await harness.sendMessage("publish:execute", {
        entityType: "newsletter",
        entityId: "test-newsletter-2024-01-01",
      });

      const reportMessages = receivedMessages.filter((m) =>
        m.type.startsWith("publish:report"),
      );
      expect(reportMessages).toHaveLength(0);
    });
  });
});
