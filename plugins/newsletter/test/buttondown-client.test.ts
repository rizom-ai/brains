import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ButtondownClient } from "../src/provider/lib/buttondown-client";
import { createSilentLogger, mockFetch } from "@brains/test-utils";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const mockLogger = createSilentLogger();

describe("ButtondownClient", () => {
  let client: ButtondownClient;

  beforeEach(() => {
    client = new ButtondownClient(
      { apiKey: "test-api-key", doubleOptIn: true },
      mockLogger,
    );
  });

  describe("createSubscriber", () => {
    it("should create a subscriber with email", async () => {
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

      const result = await client.createSubscriber({
        email: "test@example.com",
      });

      expect(result.id).toBe("sub-123");
      expect(result.email).toBe("test@example.com");
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
              metadata: { name: "Test User" },
            }),
        });
      });

      await client.createSubscriber({
        email: "test@example.com",
        name: "Test User",
      });

      expect(capturedBody).toContain("Test User");
    });

    it("should handle API errors", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ detail: "Invalid email" }),
        }),
      );

      expect(client.createSubscriber({ email: "invalid" })).rejects.toThrow();
    });

    it("should detect duplicates via error code and look up the existing subscriber", async () => {
      const requests: Array<{ url: string; method: string | undefined }> = [];
      mockFetch((url, options) => {
        requests.push({ url, method: options.method });
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
          json: () =>
            Promise.resolve({
              id: "sub-existing",
              email: "existing@example.com",
              subscriber_type: "regular",
            }),
        });
      });

      const result = await client.createSubscriber({
        email: "existing@example.com",
      });

      expect(result.id).toBe("sub-existing");
      expect(result.subscriber_type).toBe("already_subscribed");
      expect(requests).toHaveLength(2);
      expect(requests[1]?.url).toContain("/subscribers/existing%40example.com");
    });
  });

  describe("getSubscriberByEmail", () => {
    it("should fetch a subscriber by email", async () => {
      let capturedUrl: string | undefined;
      mockFetch((url) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "sub-1",
              email: "a@test.com",
              subscriber_type: "regular",
            }),
        });
      });

      const result = await client.getSubscriberByEmail("a@test.com");

      expect(result.id).toBe("sub-1");
      expect(capturedUrl).toContain("/subscribers/a%40test.com");
    });
  });

  describe("unsubscribe", () => {
    it("should unsubscribe by email", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      await client.unsubscribe("test@example.com");
    });
  });

  describe("listSubscribers", () => {
    it("should return list of subscribers", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                { id: "sub-1", email: "a@test.com" },
                { id: "sub-2", email: "b@test.com" },
              ],
              count: 2,
            }),
        }),
      );

      const result = await client.listSubscribers();

      expect(result.results).toHaveLength(2);
      expect(result.count).toBe(2);
    });
  });

  describe("createEmail", () => {
    it("should create a draft email", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "email-123",
              subject: "Test Newsletter",
              status: "draft",
            }),
        }),
      );

      const result = await client.createEmail({
        subject: "Test Newsletter",
        body: "Hello subscribers!",
      });

      expect(result.id).toBe("email-123");
      expect(result.subject).toBe("Test Newsletter");
    });

    it("should send immediately when status is about_to_send", async () => {
      let capturedBody: string | undefined;
      mockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "email-123",
              status: "sent",
            }),
        });
      });

      await client.createEmail({
        subject: "Test",
        body: "Content",
        status: "about_to_send",
      });

      expect(capturedBody).toContain("about_to_send");
    });
  });

  describe("validateCredentials", () => {
    it("should return true for valid API key", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        }),
      );

      const result = await client.validateCredentials();
      expect(result).toBe(true);
    });

    it("should return false for invalid API key", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        }),
      );

      const result = await client.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
