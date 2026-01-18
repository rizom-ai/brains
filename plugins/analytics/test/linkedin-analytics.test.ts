import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LinkedInAnalyticsClient } from "../src/lib/linkedin-analytics";

// Mock fetch
const mockFetch = mock(() => Promise.resolve(new Response()));

// Store original fetch
const originalFetch = globalThis.fetch;

describe("LinkedInAnalyticsClient", () => {
  let client: LinkedInAnalyticsClient;

  beforeEach(() => {
    client = new LinkedInAnalyticsClient("test_access_token");

    // Reset and install mock
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should create client with access token", () => {
      expect(client).toBeDefined();
    });
  });

  describe("getPostAnalytics", () => {
    it("should fetch analytics for a LinkedIn post", async () => {
      const mockResponse = {
        elements: [
          {
            totalShareStatistics: {
              impressionCount: 1500,
              likeCount: 45,
              commentCount: 12,
              shareCount: 8,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getPostAnalytics("urn:li:ugcPost:1234567890");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];

      // Verify URL contains encoded URN
      expect(url).toContain("organizationalEntityShareStatistics");
      expect(url).toContain("shares");
      expect(options.headers).toEqual(
        expect.objectContaining({
          Authorization: "Bearer test_access_token",
        }),
      );

      // Verify result
      expect(result.impressions).toBe(1500);
      expect(result.likes).toBe(45);
      expect(result.comments).toBe(12);
      expect(result.shares).toBe(8);
    });

    it("should handle empty results", async () => {
      const mockResponse = {
        elements: [],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getPostAnalytics(
        "urn:li:ugcPost:nonexistent",
      );

      // Should return zeros for missing analytics
      expect(result.impressions).toBe(0);
      expect(result.likes).toBe(0);
      expect(result.comments).toBe(0);
      expect(result.shares).toBe(0);
    });

    it("should throw error on API failure", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 }),
      );

      let error: Error | null = null;
      try {
        await client.getPostAnalytics("urn:li:ugcPost:1234567890");
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("LinkedIn API error");
    });

    it("should properly encode URN in request URL", async () => {
      const mockResponse = {
        elements: [
          {
            totalShareStatistics: {
              impressionCount: 100,
              likeCount: 10,
              commentCount: 5,
              shareCount: 2,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await client.getPostAnalytics("urn:li:ugcPost:7654321");

      const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];

      // URL should contain the encoded URN
      expect(url).toContain(encodeURIComponent("urn:li:ugcPost:7654321"));
    });
  });

  describe("validateCredentials", () => {
    it("should return true for valid credentials", async () => {
      const mockResponse = {
        sub: "abc123",
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
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

    it("should return false on network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(false);
    });
  });
});
