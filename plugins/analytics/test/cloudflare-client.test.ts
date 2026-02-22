import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { CloudflareClient } from "../src/lib/cloudflare-client";
import type { CloudflareConfig } from "../src/config";

const originalFetch = globalThis.fetch;

/**
 * Install a mock fetch that resolves with the given response.
 * Centralizes the single unavoidable cast.
 */
function installMockFetch(
  handler: (url: string, options: RequestInit) => Promise<Response>,
): void {
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}

/** Install a mock fetch that always resolves with the given response. */
function installStaticMockFetch(response: Response): void {
  installMockFetch(() => Promise.resolve(response));
}

describe("CloudflareClient", () => {
  let client: CloudflareClient;
  let config: CloudflareConfig;

  beforeEach(() => {
    config = {
      accountId: "test_account_id",
      apiToken: "cf_test_api_token",
      siteTag: "test_site_tag",
    };
    client = new CloudflareClient(config);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should create client with config", () => {
      expect(client).toBeDefined();
    });
  });

  describe("getWebsiteStats", () => {
    it("should fetch website stats from Cloudflare GraphQL API", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    count: 100,
                    sum: { visits: 80 },
                    dimensions: { date: "2025-01-15" },
                  },
                  {
                    count: 150,
                    sum: { visits: 120 },
                    dimensions: { date: "2025-01-16" },
                  },
                ],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getWebsiteStats({
        startDate: "2025-01-15",
        endDate: "2025-01-16",
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.cloudflare.com/client/v4/graphql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer cf_test_api_token",
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify aggregation
      expect(result.pageviews).toBe(250); // 100 + 150
      expect(result.visits).toBe(200); // 80 + 120
      expect(result.visitors).toBe(200); // Same as visits in Cloudflare
    });

    it("should handle empty results", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getWebsiteStats({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result.pageviews).toBe(0);
      expect(result.visitors).toBe(0);
      expect(result.visits).toBe(0);
    });

    it("should throw error on API failure", async () => {
      installStaticMockFetch(new Response("Unauthorized", { status: 401 }));

      let error: Error | null = null;
      try {
        await client.getWebsiteStats({
          startDate: "2025-01-01",
          endDate: "2025-01-31",
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cloudflare API error: 401");
    });

    it("should throw error on GraphQL errors", async () => {
      const mockResponse = {
        data: null,
        errors: [{ message: "Invalid query" }],
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      let error: Error | null = null;
      try {
        await client.getWebsiteStats({
          startDate: "2025-01-01",
          endDate: "2025-01-31",
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error?.message).toContain("Cloudflare GraphQL error");
      expect(error?.message).toContain("Invalid query");
    });

    it("should use date_geq/date_leq filters (not datetime_geq/datetime_leq)", async () => {
      const emptyResponse = {
        data: {
          viewer: {
            accounts: [{ rumPageloadEventsAdaptiveGroups: [] }],
          },
        },
      };

      let capturedBody: string | undefined;
      installMockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve(
          new Response(JSON.stringify(emptyResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      await client.getWebsiteStats({
        startDate: "2025-01-15",
        endDate: "2025-01-16",
      });

      const body = JSON.parse(capturedBody!);

      // Verify the query uses date filters, not datetime filters
      expect(body.query).toContain("date_geq");
      expect(body.query).toContain("date_leq");
      expect(body.query).not.toContain("datetime_geq");
      expect(body.query).not.toContain("datetime_leq");
    });

    it("should pass dates in YYYY-MM-DD format to the API", async () => {
      const emptyResponse = {
        data: {
          viewer: {
            accounts: [{ rumPageloadEventsAdaptiveGroups: [] }],
          },
        },
      };

      let capturedBody: string | undefined;
      installMockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve(
          new Response(JSON.stringify(emptyResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      await client.getWebsiteStats({
        startDate: "2025-01-15",
        endDate: "2025-01-16",
      });

      const body = JSON.parse(capturedBody!);

      // Verify dates are in YYYY-MM-DD format
      expect(body.variables.start).toBe("2025-01-15");
      expect(body.variables.end).toBe("2025-01-16");
    });

    it("should truncate ISO datetime strings to date format", async () => {
      const emptyResponse = {
        data: {
          viewer: {
            accounts: [{ rumPageloadEventsAdaptiveGroups: [] }],
          },
        },
      };

      let capturedBody: string | undefined;
      installMockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve(
          new Response(JSON.stringify(emptyResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      // Pass ISO datetime strings with time component
      await client.getWebsiteStats({
        startDate: "2025-01-15T10:30:00.000Z",
        endDate: "2025-01-16T23:59:59.999Z",
      });

      const body = JSON.parse(capturedBody!);

      // Should be truncated to just the date part
      expect(body.variables.start).toBe("2025-01-15");
      expect(body.variables.end).toBe("2025-01-16");
    });
  });

  describe("validateCredentials", () => {
    it("should return true for valid credentials", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [{ accountTag: "test_account_id" }],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(true);
    });

    it("should return false for invalid credentials", async () => {
      installStaticMockFetch(new Response("Unauthorized", { status: 401 }));

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(false);
    });

    it("should return false on GraphQL errors", async () => {
      const mockResponse = {
        errors: [{ message: "Authentication failed" }],
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(false);
    });

    it("should return false on network errors", async () => {
      installMockFetch(() => Promise.reject(new Error("Network error")));

      const isValid = await client.validateCredentials();
      expect(isValid).toBe(false);
    });
  });

  describe("getTopPages", () => {
    it("should fetch top pages grouped by requestPath", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    count: 45,
                    dimensions: { requestPath: "/essays/economy-of-abundance" },
                  },
                  {
                    count: 30,
                    dimensions: { requestPath: "/" },
                  },
                  {
                    count: 20,
                    dimensions: { requestPath: "/decks/offcourse" },
                  },
                ],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getTopPages({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result).toEqual([
        { path: "/essays/economy-of-abundance", views: 45 },
        { path: "/", views: 30 },
        { path: "/decks/offcourse", views: 20 },
      ]);
    });

    it("should return empty array when no data", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [{ rumPageloadEventsAdaptiveGroups: [] }],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getTopPages({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result).toEqual([]);
    });
  });

  describe("getTopReferrers", () => {
    it("should fetch top referrers grouped by refererHost", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 25 },
                    dimensions: { refererHost: "google.com" },
                  },
                  {
                    sum: { visits: 15 },
                    dimensions: { refererHost: "linkedin.com" },
                  },
                  {
                    sum: { visits: 40 },
                    dimensions: { refererHost: "" }, // Direct traffic
                  },
                ],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getTopReferrers({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result).toEqual([
        { host: "google.com", visits: 25 },
        { host: "linkedin.com", visits: 15 },
        { host: "(direct)", visits: 40 },
      ]);
    });
  });

  describe("getDeviceBreakdown", () => {
    it("should fetch device type breakdown", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 60 },
                    dimensions: { deviceType: "desktop" },
                  },
                  {
                    sum: { visits: 38 },
                    dimensions: { deviceType: "mobile" },
                  },
                  {
                    sum: { visits: 2 },
                    dimensions: { deviceType: "tablet" },
                  },
                ],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getDeviceBreakdown({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result).toEqual({
        desktop: 60,
        mobile: 38,
        tablet: 2,
      });
    });

    it("should return zeros for missing device types", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 100 },
                    dimensions: { deviceType: "desktop" },
                  },
                ],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getDeviceBreakdown({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result).toEqual({
        desktop: 100,
        mobile: 0,
        tablet: 0,
      });
    });
  });

  describe("getTopCountries", () => {
    it("should fetch top countries grouped by countryName", async () => {
      const mockResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 40 },
                    dimensions: { countryName: "United States" },
                  },
                  {
                    sum: { visits: 15 },
                    dimensions: { countryName: "Netherlands" },
                  },
                  {
                    sum: { visits: 10 },
                    dimensions: { countryName: "Germany" },
                  },
                ],
              },
            ],
          },
        },
      };

      installStaticMockFetch(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await client.getTopCountries({
        startDate: "2025-01-15",
        endDate: "2025-01-15",
      });

      expect(result).toEqual([
        { country: "United States", visits: 40 },
        { country: "Netherlands", visits: 15 },
        { country: "Germany", visits: 10 },
      ]);
    });
  });
});
