import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createServicePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { PluginTool } from "@brains/plugins";
import { AnalyticsPlugin } from "../src/index";

// Mock fetch for API calls
const mockFetch = mock(() => Promise.resolve(new Response()));
const originalFetch = globalThis.fetch;

// Null tool context for testing
const nullToolContext = {
  sessionId: "test-session",
  conversationId: "test-conversation",
  interfaceType: "test" as const,
  userId: "test-user",
  permissionContext: { interfaceId: "test", sessionId: "test" },
};

/**
 * Helper to execute a tool by name
 */
async function executeTool(
  capabilities: PluginCapabilities,
  toolName: string,
  input: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const tool = capabilities.tools.find((t) => t.name === toolName) as
    | PluginTool
    | undefined;
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return tool.handler(input, nullToolContext);
}

describe("AnalyticsPlugin Integration", () => {
  let harness: ReturnType<typeof createServicePluginHarness> | undefined;
  let plugin: AnalyticsPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(() => {
    // Install fetch mock
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    // Reset harness if it was initialized
    harness?.reset();
  });

  describe("Plugin Registration", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
        linkedin: {
          accessToken: "test_linkedin_token",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("analytics");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBe("0.1.0");
    });

    it("should register entity types", () => {
      expect(harness).toBeDefined();
      const shell = harness?.getShell();
      const entityService = shell?.getEntityService();

      // Entity types are registered through the context
      expect(entityService).toBeDefined();
    });

    it("should provide all tools when both providers configured", () => {
      expect(capabilities.tools.length).toBe(4);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("analytics_query_website");
      expect(toolNames).toContain("analytics_get_website_trends");
      expect(toolNames).toContain("analytics_fetch_social");
      expect(toolNames).toContain("analytics_get_social_summary");
    });

    it("should have correct tool descriptions", () => {
      const fetchWebsiteTool = capabilities.tools.find(
        (t) => t.name === "analytics_query_website",
      );
      expect(fetchWebsiteTool?.description).toContain("Cloudflare");

      const fetchSocialTool = capabilities.tools.find(
        (t) => t.name === "analytics_fetch_social",
      );
      expect(fetchSocialTool?.description).toContain("LinkedIn");
    });
  });

  describe("Cloudflare-only Configuration", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
        // No LinkedIn config
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should only provide Cloudflare tools", () => {
      expect(capabilities.tools.length).toBe(2);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("analytics_query_website");
      expect(toolNames).toContain("analytics_get_website_trends");
      expect(toolNames).not.toContain("analytics_fetch_social");
      expect(toolNames).not.toContain("analytics_get_social_summary");
    });
  });

  describe("LinkedIn-only Configuration", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        // No Cloudflare config
        linkedin: {
          accessToken: "test_linkedin_token",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should only provide LinkedIn tools", () => {
      expect(capabilities.tools.length).toBe(2);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).not.toContain("analytics_query_website");
      expect(toolNames).not.toContain("analytics_get_website_trends");
      expect(toolNames).toContain("analytics_fetch_social");
      expect(toolNames).toContain("analytics_get_social_summary");
    });
  });

  describe("No Providers Configuration", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        // No providers configured
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should provide no tools when no providers configured", () => {
      expect(capabilities.tools.length).toBe(0);
    });
  });

  describe("Tool Execution - query_website", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should query website metrics for a single day without storing", async () => {
      // Mock Cloudflare API responses for all 5 parallel calls
      const mockStatsResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    count: 500,
                    sum: { visits: 400 },
                    dimensions: { date: "2025-01-15" },
                  },
                ],
              },
            ],
          },
        },
      };

      const mockTopPagesResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  { count: 45, dimensions: { requestPath: "/essays/test" } },
                ],
              },
            ],
          },
        },
      };

      const mockReferrersResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 25 },
                    dimensions: { refererHost: "google.com" },
                  },
                ],
              },
            ],
          },
        },
      };

      const mockDevicesResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 60 },
                    dimensions: { deviceType: "desktop" },
                  },
                  { sum: { visits: 38 }, dimensions: { deviceType: "mobile" } },
                  { sum: { visits: 2 }, dimensions: { deviceType: "tablet" } },
                ],
              },
            ],
          },
        },
      };

      const mockCountriesResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 40 },
                    dimensions: { countryName: "United States" },
                  },
                ],
              },
            ],
          },
        },
      };

      // Mock all 5 API calls
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockStatsResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockTopPagesResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockReferrersResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockDevicesResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockCountriesResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

      // Execute tool
      const result = await executeTool(
        capabilities,
        "analytics_query_website",
        {
          date: "2025-01-15",
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        startDate: string;
        endDate: string;
        pageviews: number;
        visitors: number;
        topPages: Array<{ path: string; views: number }>;
        topReferrers: Array<{ host: string; visits: number }>;
        devices: { desktop: number; mobile: number; tablet: number };
        topCountries: Array<{ country: string; visits: number }>;
      };
      expect(data.startDate).toBe("2025-01-15");
      expect(data.endDate).toBe("2025-01-15");
      expect(data.pageviews).toBe(500);
      expect(data.visitors).toBe(400);
      expect(data.topPages).toHaveLength(1);
      expect(data.topPages[0]?.path).toBe("/essays/test");
      expect(data.devices.desktop).toBe(60);
    });

    it("should handle API errors gracefully", async () => {
      // Mock all 5 parallel API calls to return 401
      mockFetch
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      const result = await executeTool(
        capabilities,
        "analytics_query_website",
        {
          date: "2025-01-15",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
    });

    it("should query website metrics for a date range using days parameter", async () => {
      // Mock Cloudflare API responses for all 5 parallel calls
      const mockStatsResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    count: 1500,
                    sum: { visits: 1200 },
                    dimensions: { date: "2025-01-15" },
                  },
                ],
              },
            ],
          },
        },
      };

      const mockTopPagesResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  { count: 200, dimensions: { requestPath: "/" } },
                  { count: 150, dimensions: { requestPath: "/essays/test" } },
                ],
              },
            ],
          },
        },
      };

      const mockReferrersResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 100 },
                    dimensions: { refererHost: "google.com" },
                  },
                ],
              },
            ],
          },
        },
      };

      const mockDevicesResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 700 },
                    dimensions: { deviceType: "desktop" },
                  },
                  {
                    sum: { visits: 450 },
                    dimensions: { deviceType: "mobile" },
                  },
                  { sum: { visits: 50 }, dimensions: { deviceType: "tablet" } },
                ],
              },
            ],
          },
        },
      };

      const mockCountriesResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    sum: { visits: 500 },
                    dimensions: { countryName: "United States" },
                  },
                  {
                    sum: { visits: 300 },
                    dimensions: { countryName: "Netherlands" },
                  },
                ],
              },
            ],
          },
        },
      };

      // Mock all 5 API calls
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockStatsResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockTopPagesResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockReferrersResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockDevicesResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockCountriesResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

      // Execute tool with days parameter
      const result = await executeTool(
        capabilities,
        "analytics_query_website",
        {
          days: 7,
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        startDate: string;
        endDate: string;
        pageviews: number;
        visitors: number;
        topPages: Array<{ path: string; views: number }>;
      };
      // Should have a 7-day range
      expect(data.pageviews).toBe(1500);
      expect(data.visitors).toBe(1200);
      expect(data.topPages).toHaveLength(2);
    });
  });

  describe("Tool Execution - get_website_trends", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should return empty trends when no metrics stored", async () => {
      const result = await executeTool(
        capabilities,
        "analytics_get_website_trends",
        { limit: 10 },
      );

      expect(result.success).toBe(true);
      const data = result.data as { count: number; trends: unknown[] };
      expect(data.count).toBe(0);
      expect(data.trends).toEqual([]);
    });
  });

  describe("Tool Execution - fetch_social", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        linkedin: {
          accessToken: "test_linkedin_token",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should return empty when no published posts", async () => {
      const result = await executeTool(
        capabilities,
        "analytics_fetch_social",
        {},
      );

      expect(result.success).toBe(true);
      const data = result.data as { fetched: number };
      expect(data.fetched).toBe(0);
    });
  });

  describe("Tool Execution - get_social_summary", () => {
    beforeEach(async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        linkedin: {
          accessToken: "test_linkedin_token",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should return empty summary when no metrics stored", async () => {
      const result = await executeTool(
        capabilities,
        "analytics_get_social_summary",
        { limit: 10 },
      );

      expect(result.success).toBe(true);
      const data = result.data as {
        count: number;
        totals: { impressions: number };
      };
      expect(data.count).toBe(0);
      expect(data.totals.impressions).toBe(0);
    });
  });

  describe("Plugin Lifecycle", () => {
    it("should handle plugin registration and reset", async () => {
      harness = createServicePluginHarness({ dataDir: "/tmp/test-analytics" });

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
        linkedin: {
          accessToken: "test_linkedin_token",
        },
      });

      const caps = await harness.installPlugin(plugin);
      expect(caps.tools.length).toBe(4);

      // Reset harness should not throw
      harness.reset();

      // After reset, can install a new plugin
      const newPlugin = new AnalyticsPlugin({});
      const newCaps = await harness.installPlugin(newPlugin);
      expect(newCaps.tools.length).toBe(0);
    });
  });
});
