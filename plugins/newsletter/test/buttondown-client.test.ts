import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ButtondownClient } from "../src/lib/buttondown-client";
import type { Logger } from "@brains/utils";

// Save original fetch to restore after tests
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Mock logger - cast through unknown to satisfy type checker
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => mockLogger,
} as unknown as Logger;

// Helper to create a mock fetch that satisfies TypeScript
function mockFetch(
  handler: (url: string, options: RequestInit) => Promise<Partial<Response>>,
): void {
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}

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
  });

  describe("unsubscribe", () => {
    it("should unsubscribe by email", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      // Should resolve without throwing
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
