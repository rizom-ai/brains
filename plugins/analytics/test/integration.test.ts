import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import type { PluginTool } from "@brains/plugins";
import { AnalyticsPlugin } from "../src/index";

const originalFetch = globalThis.fetch;

/**
 * Install a mock fetch that returns responses from the queue in order.
 * Centralizes the single unavoidable cast.
 */
function installMockFetch(responses: Response[]): void {
  let callIndex = 0;
  globalThis.fetch = mock(() => {
    const response = responses[callIndex++];
    return Promise.resolve(response ?? new Response("", { status: 500 }));
  }) as unknown as typeof fetch;
}

/** Create a JSON response with status 200. */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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
  let harness: ReturnType<typeof createPluginHarness> | undefined;
  let plugin: AnalyticsPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(() => {
    installMockFetch([]);
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    // Reset harness if it was initialized
    harness?.reset();
  });

  describe("Plugin Registration", () => {
    beforeEach(async () => {
      harness = createPluginHarness();

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("analytics");
      expect(plugin.type).toBe("core");
      expect(plugin.version).toBe("0.1.0");
    });

    it("should provide query tool when Cloudflare is configured", () => {
      expect(capabilities.tools.length).toBe(1);

      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("analytics_query");
    });

    it("should have correct tool description", () => {
      const queryTool = capabilities.tools.find(
        (t) => t.name === "analytics_query",
      );
      expect(queryTool?.description).toContain("Cloudflare");
      expect(queryTool?.description).toContain("Date range options");
    });
  });

  describe("No Providers Configuration", () => {
    beforeEach(async () => {
      harness = createPluginHarness();

      plugin = new AnalyticsPlugin({
        // No providers configured
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should provide no tools when no providers configured", () => {
      expect(capabilities.tools.length).toBe(0);
    });
  });

  describe("Tool Execution - analytics_query", () => {
    beforeEach(async () => {
      harness = createPluginHarness();

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
      });

      capabilities = await harness.installPlugin(plugin);
    });

    it("should query website metrics for a single day", async () => {
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

      installMockFetch([
        jsonResponse(mockStatsResponse),
        jsonResponse(mockTopPagesResponse),
        jsonResponse(mockReferrersResponse),
        jsonResponse(mockDevicesResponse),
        jsonResponse(mockCountriesResponse),
      ]);

      const result = await executeTool(capabilities, "analytics_query", {
        date: "2025-01-15",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        range: { startDate: string; endDate: string };
        summary: { pageviews: number; visitors: number };
        topPages: Array<{ path: string; views: number }>;
        topReferrers: Array<{ host: string; visits: number }>;
        devices: { desktop: number; mobile: number; tablet: number };
        topCountries: Array<{ country: string; visits: number }>;
      };
      expect(data.range.startDate).toBe("2025-01-15");
      expect(data.range.endDate).toBe("2025-01-15");
      expect(data.summary.pageviews).toBe(500);
      expect(data.summary.visitors).toBe(400);
      expect(data.topPages).toHaveLength(1);
      expect(data.topPages[0]?.path).toBe("/essays/test");
      expect(data.devices.desktop).toBe(60);
    });

    it("should handle API errors gracefully", async () => {
      const unauthorized = Array.from(
        { length: 5 },
        () => new Response("Unauthorized", { status: 401 }),
      );
      installMockFetch(unauthorized);

      const result = await executeTool(capabilities, "analytics_query", {
        date: "2025-01-15",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
    });

    it("should query website metrics for a date range using days parameter", async () => {
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

      installMockFetch([
        jsonResponse(mockStatsResponse),
        jsonResponse(mockTopPagesResponse),
        jsonResponse(mockReferrersResponse),
        jsonResponse(mockDevicesResponse),
        jsonResponse(mockCountriesResponse),
      ]);
      const result = await executeTool(capabilities, "analytics_query", {
        days: 7,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        range: { startDate: string; endDate: string };
        summary: { pageviews: number; visitors: number };
        topPages: Array<{ path: string; views: number }>;
      };
      // Should have a 7-day range
      expect(data.summary.pageviews).toBe(1500);
      expect(data.summary.visitors).toBe(1200);
      expect(data.topPages).toHaveLength(2);
    });

    it("should query website metrics with custom date range", async () => {
      const mockStatsResponse = {
        data: {
          viewer: {
            accounts: [
              {
                rumPageloadEventsAdaptiveGroups: [
                  {
                    count: 3000,
                    sum: { visits: 2500 },
                    dimensions: { date: "2025-01-01" },
                  },
                ],
              },
            ],
          },
        },
      };

      const mockEmptyResponse = {
        data: {
          viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [] }] },
        },
      };

      installMockFetch([
        jsonResponse(mockStatsResponse),
        jsonResponse(mockEmptyResponse),
        jsonResponse(mockEmptyResponse),
        jsonResponse(mockEmptyResponse),
        jsonResponse(mockEmptyResponse),
      ]);

      // Execute tool with custom date range
      const result = await executeTool(capabilities, "analytics_query", {
        startDate: "2025-01-01",
        endDate: "2025-01-31",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as {
        range: { startDate: string; endDate: string };
        summary: { pageviews: number; visitors: number };
      };
      expect(data.range.startDate).toBe("2025-01-01");
      expect(data.range.endDate).toBe("2025-01-31");
      expect(data.summary.pageviews).toBe(3000);
    });

    it("should reject conflicting parameters", async () => {
      const result = await executeTool(capabilities, "analytics_query", {
        date: "2025-01-15",
        days: 7,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot combine");
    });

    it("should reject incomplete custom range", async () => {
      const result = await executeTool(capabilities, "analytics_query", {
        startDate: "2025-01-01",
        // Missing endDate
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("startDate");
    });
  });

  describe("Plugin Lifecycle", () => {
    it("should handle plugin registration and reset", async () => {
      harness = createPluginHarness();

      plugin = new AnalyticsPlugin({
        cloudflare: {
          accountId: "test_account",
          apiToken: "test_token",
          siteTag: "test_site",
        },
      });

      const caps = await harness.installPlugin(plugin);
      expect(caps.tools.length).toBe(1);

      // Reset harness should not throw
      harness.reset();

      // After reset, can install a new plugin
      const newPlugin = new AnalyticsPlugin({});
      const newCaps = await harness.installPlugin(newPlugin);
      expect(newCaps.tools.length).toBe(0);
    });
  });
});
