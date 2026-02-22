import { describe, it, expect, spyOn, afterEach } from "bun:test";
import {
  createSilentLogger,
  createMockEntityService,
  mockFetch,
} from "@brains/test-utils";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const mockLogger = createSilentLogger();

describe("Newsletter Auto-Send on Publish", () => {
  describe("handlePublishCompleted", () => {
    it("should create and send newsletter when post is published and autoSendOnPublish is true", async () => {
      let capturedEmailBody: string | undefined;
      mockFetch((_url, options) => {
        capturedEmailBody = options.body as string;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "email-123",
              subject: "My Blog Post",
              status: "sent",
            }),
        });
      });

      const { handlePublishCompleted } = await import(
        "../src/handlers/publish-handler"
      );

      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "post-1",
        entityType: "post",
        content: "# My Blog Post\n\nThis is the content.",
        metadata: {
          title: "My Blog Post",
          slug: "my-blog-post",
          status: "published",
        },
        contentHash: "",
        created: "",
        updated: "",
      });

      const result = await handlePublishCompleted(
        {
          entityType: "post",
          entityId: "post-1",
          result: { id: "post-1" },
        },
        {
          apiKey: "test-key",
          doubleOptIn: true,
        },
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(true);
      if (result.success && "emailId" in result) {
        expect(result.emailId).toBe("email-123");
      }
      expect(capturedEmailBody).toContain("My Blog Post");
      expect(capturedEmailBody).toContain("about_to_send");
    });

    it("should skip non-post entity types", async () => {
      const { handlePublishCompleted } = await import(
        "../src/handlers/publish-handler"
      );

      const mockEntityService = createMockEntityService();

      const result = await handlePublishCompleted(
        {
          entityType: "deck",
          entityId: "deck-1",
          result: { id: "deck-1" },
        },
        {
          apiKey: "test-key",
          doubleOptIn: true,
        },
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(true);
      if (result.success && "skipped" in result) {
        expect(result.skipped).toBe(true);
        expect(result.reason).toContain("post");
      }
    });

    it("should handle missing post gracefully", async () => {
      const { handlePublishCompleted } = await import(
        "../src/handlers/publish-handler"
      );

      const mockEntityService = createMockEntityService();

      const result = await handlePublishCompleted(
        {
          entityType: "post",
          entityId: "non-existent",
          result: { id: "non-existent" },
        },
        {
          apiKey: "test-key",
          doubleOptIn: true,
        },
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should handle Buttondown API errors gracefully", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ detail: "Server error" }),
        }),
      );

      const { handlePublishCompleted } = await import(
        "../src/handlers/publish-handler"
      );

      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "post-1",
        entityType: "post",
        content: "# Test\n\nContent",
        metadata: { title: "Test", slug: "test", status: "published" },
        contentHash: "",
        created: "",
        updated: "",
      });

      const result = await handlePublishCompleted(
        {
          entityType: "post",
          entityId: "post-1",
          result: { id: "post-1" },
        },
        {
          apiKey: "test-key",
          doubleOptIn: true,
        },
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("config schema", () => {
    it("should support autoSendOnPublish option", async () => {
      const { newsletterConfigSchema } = await import("../src/config");

      const result = newsletterConfigSchema.safeParse({
        buttondown: { apiKey: "test-key" },
        autoSendOnPublish: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoSendOnPublish).toBe(true);
      }
    });

    it("should default autoSendOnPublish to false", async () => {
      const { newsletterConfigSchema } = await import("../src/config");

      const result = newsletterConfigSchema.safeParse({
        buttondown: { apiKey: "test-key" },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoSendOnPublish).toBe(false);
      }
    });
  });
});
