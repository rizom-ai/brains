import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { ButtondownPlugin } from "../src/provider/plugin";
import { createButtondownTools } from "../src/provider/tools";
import type { ButtondownFetch } from "../src/provider/lib/buttondown-client";

// The client is built with a delegate to this, so a test can stub before or
// after construction. Unstubbed calls fail loudly rather than reaching the
// network.
let fetchFn: ButtondownFetch = () =>
  Promise.reject(new Error("fetch called without a stub"));
const delegatingFetch: ButtondownFetch = (url, init) => fetchFn(url, init);

function stubFetch(handler: ButtondownFetch): void {
  fetchFn = handler;
}

describe("Buttondown Tools", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  it("registers one canonical newsletter subscriber tool", () => {
    const tools = createButtondownTools(
      "buttondown",
      { apiKey: "test-key", doubleOptIn: true },
      createSilentLogger("buttondown-tools-test"),
    );

    expect(tools.map((tool) => tool.name)).toEqual(["newsletter_subscribers"]);
  });

  it("uses OpenAI-compatible email patterns in model-visible tool schemas", () => {
    const tools = createButtondownTools(
      "buttondown",
      { apiKey: "test-key", doubleOptIn: true },
      createSilentLogger("buttondown-tools-test"),
    );

    for (const tool of tools) {
      const jsonSchema = z.toJSONSchema(z.object(tool.inputSchema));
      expect(JSON.stringify(jsonSchema)).not.toContain("(?!");
    }
  });

  beforeEach(async () => {
    harness = createPluginHarness();
  });

  afterEach(async () => {
    await harness.reset();
  });

  describe("newsletter_subscribers subscribe action", () => {
    it("should subscribe email via Buttondown API", async () => {
      stubFetch(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "sub-123",
              email: "test@example.com",
              subscriber_type: "unactivated",
            }),
        }),
      );

      await harness.installPlugin(
        new ButtondownPlugin(
          { apiKey: "test-key", doubleOptIn: true },
          { fetch: delegatingFetch },
        ),
      );

      const result = await harness.executeTool("newsletter_subscribers", {
        action: "subscribe",
        email: "test@example.com",
      });

      expectSuccess(result);
      expect(result.data).toHaveProperty("subscriberId", "sub-123");
    });

    it("should include name when provided", async () => {
      let capturedBody: string | undefined;
      stubFetch((_url, options) => {
        capturedBody = z.string().parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "sub-123",
              email: "test@example.com",
            }),
        });
      });

      await harness.installPlugin(
        new ButtondownPlugin(
          { apiKey: "test-key", doubleOptIn: true },
          { fetch: delegatingFetch },
        ),
      );

      await harness.executeTool("newsletter_subscribers", {
        action: "subscribe",
        email: "test@example.com",
        name: "Test User",
      });

      expect(capturedBody).toContain("Test User");
    });

    it("should surface the API's error detail", async () => {
      // A well-formed address, so the request goes out and the stubbed 400
      // is what the tool has to report.
      stubFetch(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ detail: "Subscriber limit reached" }),
        }),
      );

      await harness.installPlugin(
        new ButtondownPlugin(
          { apiKey: "test-key", doubleOptIn: true },
          { fetch: delegatingFetch },
        ),
      );

      const result = await harness.executeTool("newsletter_subscribers", {
        action: "subscribe",
        email: "one-too-many@example.com",
      });

      expectError(result);
      expect(result.error).toContain("Subscriber limit reached");
    });

    it("should detect already subscribed users", async () => {
      stubFetch((_url, options) => {
        if (options.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () =>
              Promise.resolve({
                code: "email_already_exists",
                detail:
                  "That email address already has an associated subscriber.",
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "sub-existing",
              email: "existing@example.com",
              subscriber_type: "regular",
            }),
        });
      });

      await harness.installPlugin(
        new ButtondownPlugin(
          { apiKey: "test-key", doubleOptIn: true },
          { fetch: delegatingFetch },
        ),
      );

      const result = await harness.executeTool("newsletter_subscribers", {
        action: "subscribe",
        email: "existing@example.com",
      });

      expectSuccess(result);
      expect(result.data).toHaveProperty("message", "already_subscribed");
      expect(result.data).toHaveProperty("subscriberId", "sub-existing");
    });
  });

  describe("newsletter_subscribers unsubscribe action", () => {
    it("should unsubscribe email via Buttondown API", async () => {
      stubFetch(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        }),
      );

      await harness.installPlugin(
        new ButtondownPlugin(
          { apiKey: "test-key", doubleOptIn: true },
          { fetch: delegatingFetch },
        ),
      );

      const result = await harness.executeTool("newsletter_subscribers", {
        action: "unsubscribe",
        email: "test@example.com",
      });

      expectSuccess(result);
    });
  });

  describe("newsletter_subscribers list action", () => {
    it("should list subscribers from Buttondown API", async () => {
      stubFetch(() =>
        Promise.resolve({
          ok: true,
          status: 200,
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
        new ButtondownPlugin(
          { apiKey: "test-key", doubleOptIn: true },
          { fetch: delegatingFetch },
        ),
      );

      const result = await harness.executeTool("newsletter_subscribers", {
        action: "list",
      });

      expectSuccess(result);
      expect(result.data).toHaveProperty("subscribers");
      expect(result.data).toHaveProperty("count", 2);
    });
  });

  describe("without buttondown config", () => {
    it("should return empty tools array when no config provided", async () => {
      await harness.installPlugin(new ButtondownPlugin({}));

      // Tools should not be registered, so executing should throw
      expect(
        harness.executeTool("newsletter_subscribers", {
          action: "subscribe",
          email: "test@example.com",
        }),
      ).rejects.toThrow("Tool not found");
    });
  });
});
