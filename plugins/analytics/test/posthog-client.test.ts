import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PostHogClient } from "../src/lib/posthog-client";
import type { PosthogConfig } from "../src/config";

// Mock fetch
const mockFetch = mock(() => Promise.resolve(new Response()));

// Store original fetch
const originalFetch = globalThis.fetch;

describe("PostHogClient", () => {
  let client: PostHogClient;
  let config: PosthogConfig;

  beforeEach(() => {
    config = {
      enabled: true,
      projectId: "12345",
      apiKey: "phx_test_key",
    };
    client = new PostHogClient(config);

    // Reset and install mock
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should create client with EU base URL", () => {
      expect(client).toBeDefined();
    });
  });

  describe("getInsights", () => {
    it("should fetch pageview insights from PostHog API", async () => {
      const mockResponse = {
        result: [
          {
            data: [100, 150, 200],
            days: ["2025-01-13", "2025-01-14", "2025-01-15"],
            label: "$pageview",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getInsights({
        startDate: "2025-01-13",
        endDate: "2025-01-15",
        event: "$pageview",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toContain(
        "https://eu.posthog.com/api/projects/12345/insights/trend",
      );
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer phx_test_key",
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it("should include date range in query params", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ result: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.getInsights({
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        event: "$pageview",
      });

      const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("date_from=2025-01-01");
      expect(url).toContain("date_to=2025-01-31");
    });

    it("should throw error on API failure", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 }),
      );

      let error: Error | null = null;
      try {
        await client.getInsights({
          startDate: "2025-01-01",
          endDate: "2025-01-31",
          event: "$pageview",
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("PostHog API error: 401");
    });
  });

  describe("getWebsiteStats", () => {
    it("should aggregate daily metrics", async () => {
      // Mock pageview response
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [{ data: [100, 150, 200], count: 450 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      // Mock unique visitors response
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [{ data: [50, 75, 100], count: 225 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      // Mock sessions response
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [{ data: [60, 80, 110], count: 250 }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const stats = await client.getWebsiteStats({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(stats.pageviews).toBe(450);
      expect(stats.visitors).toBe(225);
      expect(stats.visits).toBe(250);
    });

    it("should handle empty results", async () => {
      // Each call needs a fresh Response object
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ result: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const stats = await client.getWebsiteStats({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(stats.pageviews).toBe(0);
      expect(stats.visitors).toBe(0);
      expect(stats.visits).toBe(0);
    });
  });

  describe("validateCredentials", () => {
    it("should return true for valid credentials", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(true);
    });

    it("should return false for invalid credentials", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 }),
      );

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(false);
    });
  });
});
