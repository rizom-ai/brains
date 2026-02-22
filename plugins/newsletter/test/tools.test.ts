import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { mockFetch } from "@brains/test-utils";
import { NewsletterPlugin } from "../src";

// Save original fetch to restore after tests
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Newsletter Tools", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness();
  });

  afterEach(() => {
    harness.reset();
  });

  describe("newsletter_subscribe", () => {
    it("should subscribe email via Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "sub-123",
              email: "test@example.com",
              subscriber_type: "unactivated",
            }),
        }),
      );

      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_subscribe", {
        email: "test@example.com",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("subscriberId", "sub-123");
      }
    });

    it("should include name when provided", async () => {
      let capturedBody: string | undefined;
      mockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "sub-123",
              email: "test@example.com",
            }),
        });
      });

      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      await harness.executeTool("newsletter_subscribe", {
        email: "test@example.com",
        name: "Test User",
      });

      expect(capturedBody).toContain("Test User");
    });

    it("should handle API errors gracefully", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ detail: "Invalid email" }),
        }),
      );

      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_subscribe", {
        email: "invalid",
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("Invalid email");
    });

    it("should detect already subscribed users", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              detail: "This email is already subscribed (id=sub-existing)",
            }),
        }),
      );

      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_subscribe", {
        email: "existing@example.com",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("message", "already_subscribed");
      }
    });
  });

  describe("newsletter_unsubscribe", () => {
    it("should unsubscribe email via Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_unsubscribe", {
        email: "test@example.com",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("newsletter_list_subscribers", () => {
    it("should list subscribers from Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: "sub-1",
                  email: "a@test.com",
                  subscriber_type: "regular",
                },
                {
                  id: "sub-2",
                  email: "b@test.com",
                  subscriber_type: "regular",
                },
              ],
              count: 2,
            }),
        }),
      );

      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool(
        "newsletter_list_subscribers",
        {},
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("subscribers");
        expect(result.data).toHaveProperty("count", 2);
      }
    });
  });

  describe("newsletter_generate", () => {
    it("should queue a generation job with prompt", async () => {
      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_generate", {
        prompt: "Create a newsletter about our latest product updates",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("jobId");
      }
    });

    it("should queue a generation job with source entity IDs", async () => {
      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_generate", {
        sourceEntityIds: ["post-1", "post-2"],
        sourceEntityType: "post",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("jobId");
      }
    });

    it("should queue a generation job with direct content", async () => {
      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_generate", {
        subject: "Weekly Update",
        content: "Hello subscribers! Here are this week's highlights...",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("jobId");
      }
    });

    it("should fail when no content source provided", async () => {
      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_generate", {});

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });

    it("should accept addToQueue flag", async () => {
      await harness.installPlugin(
        new NewsletterPlugin({
          buttondown: {
            apiKey: "test-key",
            doubleOptIn: true,
          },
        }),
      );

      const result = await harness.executeTool("newsletter_generate", {
        prompt: "Create a newsletter",
        addToQueue: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("without buttondown config", () => {
    it("should return empty tools array when no config provided", async () => {
      await harness.installPlugin(new NewsletterPlugin({}));

      // Tools should not be registered, so executing should throw
      expect(
        harness.executeTool("newsletter_subscribe", {
          email: "test@example.com",
        }),
      ).rejects.toThrow("Tool not found");
    });
  });
});
