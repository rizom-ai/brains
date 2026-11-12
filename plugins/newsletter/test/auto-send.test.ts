import { createMockEntityService } from "@brains/entity-service/test";
import { describe, it, expect, spyOn } from "bun:test";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import { ButtondownNewsletterProvider } from "../src/provider/buttondown-provider";
import type { ButtondownFetch } from "../src/provider/lib/buttondown-client";
import { createButtondownPlugin } from "./newsletter-plugins";
import { z } from "@brains/utils/zod";

// The client is built with a delegate to this, so a test can stub before or
// after construction. Unstubbed calls fail loudly rather than reaching the
// network.
let fetchFn: ButtondownFetch = () =>
  Promise.reject(new Error("fetch called without a stub"));
const delegatingFetch: ButtondownFetch = (url, init) => fetchFn(url, init);

function stubFetch(handler: ButtondownFetch): void {
  fetchFn = handler;
}

const mockLogger = createSilentLogger();

describe("Newsletter Auto-Send on Publish", () => {
  describe("handlePublishCompleted", () => {
    it("should create and send newsletter when post is published and autoSendOnPublish is true", async () => {
      let capturedEmailBody: string | undefined;
      stubFetch((_url, options) => {
        capturedEmailBody = z.string().parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "email-123",
              subject: "My Blog Post",
              status: "sent",
            }),
        });
      });

      const { handlePublishCompleted } =
        await import("../src/provider/publish-handler");

      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "post-1",
        entityType: "post",
        content: "# My Blog Post\n\nThis is the content.",
        visibility: "public",
        metadata: {
          title: "My Blog Post",
          slug: "my-blog-post",
          status: "published",
        },
        contentHash: "",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
      });

      const result = await handlePublishCompleted(
        {
          entityType: "post",
          entityId: "post-1",
          result: { id: "post-1" },
        },
        new ButtondownNewsletterProvider(
          { apiKey: "test-key", doubleOptIn: true },
          mockLogger,
          { fetch: delegatingFetch },
        ),
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(true);
      if (result.success && "deliveryId" in result) {
        expect(result.deliveryId).toBe("email-123");
      }
      expect(capturedEmailBody).toContain("My Blog Post");
      expect(capturedEmailBody).toContain("about_to_send");
    });

    it("should skip non-post entity types", async () => {
      const { handlePublishCompleted } =
        await import("../src/provider/publish-handler");

      const mockEntityService = createMockEntityService();

      const result = await handlePublishCompleted(
        {
          entityType: "deck",
          entityId: "deck-1",
          result: { id: "deck-1" },
        },
        new ButtondownNewsletterProvider(
          { apiKey: "test-key", doubleOptIn: true },
          mockLogger,
          { fetch: delegatingFetch },
        ),
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
      const { handlePublishCompleted } =
        await import("../src/provider/publish-handler");

      const mockEntityService = createMockEntityService();

      const result = await handlePublishCompleted(
        {
          entityType: "post",
          entityId: "non-existent",
          result: { id: "non-existent" },
        },
        new ButtondownNewsletterProvider(
          { apiKey: "test-key", doubleOptIn: true },
          mockLogger,
          { fetch: delegatingFetch },
        ),
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should handle Buttondown API errors gracefully", async () => {
      stubFetch(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ detail: "Server error" }),
        }),
      );

      const { handlePublishCompleted } =
        await import("../src/provider/publish-handler");

      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "getEntity").mockResolvedValue({
        id: "post-1",
        entityType: "post",
        content: "# Test\n\nContent",
        visibility: "public",
        metadata: { title: "Test", slug: "test", status: "published" },
        contentHash: "",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
      });

      const result = await handlePublishCompleted(
        {
          entityType: "post",
          entityId: "post-1",
          result: { id: "post-1" },
        },
        new ButtondownNewsletterProvider(
          { apiKey: "test-key", doubleOptIn: true },
          mockLogger,
          { fetch: delegatingFetch },
        ),
        mockEntityService,
        mockLogger,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Server error");
      }
    });
  });

  describe("publish:completed subscriber", () => {
    it("logs a failed auto-send, which no publisher reads back", async () => {
      // The pipeline broadcasts publish:completed and reads no reply, so the
      // failure is the log line the class wrote, and nothing is sent.
      const logger = createMockLogger();
      const harness = createPluginHarness({ logger });
      await harness.installPlugin(
        createButtondownPlugin({ apiKey: "test-key", autoSendOnPublish: true }),
      );

      await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: "publish:completed",
          payload: {
            entityType: "post",
            entityId: "missing-post",
            result: { id: "missing-post" },
          },
          sender: "test",
        });

      expect(logger.error).toHaveBeenCalledWith(
        "Newsletter auto-send failed",
        expect.objectContaining({
          entityId: "missing-post",
          error: "Post missing-post not found",
        }),
      );
      await harness.reset();
    });

    it("refuses a publish event without its entity instead of looking up undefined", async () => {
      const harness = createPluginHarness();
      await harness.installPlugin(
        createButtondownPlugin({ apiKey: "test-key", autoSendOnPublish: true }),
      );

      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: "publish:completed",
          payload: { entityType: "post", result: { id: "remote" } },
          sender: "test",
        });

      expect(response).toEqual({
        success: false,
        error: "Invalid publish:completed payload",
      });
      await harness.reset();
    });
  });
});
