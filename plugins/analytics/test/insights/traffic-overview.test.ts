import { describe, it, expect, mock } from "bun:test";
import { createTrafficOverviewInsight } from "../../src/insights/traffic-overview";
import type { CloudflareClient } from "../../src/lib/cloudflare-client";
import type { ICoreEntityService } from "@brains/plugins";

const mockEntityService = {} as ICoreEntityService;

function createMockClient(
  overrides: Partial<CloudflareClient> = {},
): CloudflareClient {
  return {
    getWebsiteStats: mock(async () => ({
      pageviews: 1200,
      visitors: 450,
      visits: 450,
      bounces: 0,
      totalTime: 0,
    })),
    getTopPages: mock(async () => [
      { path: "/blog/why-institutions-fail", views: 320 },
      { path: "/blog/learning-to-learn", views: 180 },
      { path: "/", views: 150 },
    ]),
    ...overrides,
  } as unknown as CloudflareClient;
}

describe("traffic-overview insight", () => {
  it("should return pageviews, visitors, and top pages", async () => {
    const client = createMockClient();
    const handler = createTrafficOverviewInsight(client);
    const result = await handler(mockEntityService);

    expect(result["pageviews"]).toBe(1200);
    expect(result["visitors"]).toBe(450);

    const topPages = result["topPages"] as Array<{
      path: string;
      views: number;
    }>;
    expect(topPages).toHaveLength(3);
    expect(topPages[0]).toMatchObject({
      path: "/blog/why-institutions-fail",
      views: 320,
    });
  });

  it("should include date range in result", async () => {
    const client = createMockClient();
    const handler = createTrafficOverviewInsight(client);
    const result = await handler(mockEntityService);

    expect(result["days"]).toBe(7);
  });

  it("should handle API errors gracefully", async () => {
    const client = createMockClient({
      getWebsiteStats: mock(async () => {
        throw new Error("API rate limited");
      }),
    });

    const handler = createTrafficOverviewInsight(client);
    const result = await handler(mockEntityService);

    expect(result["error"]).toBe("API rate limited");
    expect(result["pageviews"]).toBeUndefined();
  });

  it("should return unavailable when no client provided", async () => {
    const handler = createTrafficOverviewInsight(undefined);
    const result = await handler(mockEntityService);

    expect(result["unavailable"]).toBe(true);
  });
});
