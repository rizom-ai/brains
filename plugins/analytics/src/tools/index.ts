import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import { z, toISODateString, getYesterday } from "@brains/utils";
import { CloudflareClient } from "../lib/cloudflare-client";
import type { CloudflareConfig } from "../config";
import { createWebsiteMetricsEntity } from "../schemas/website-metrics";
import type { WebsiteMetricsEntity } from "../schemas/website-metrics";

// Schema for fetch_website tool parameters
const fetchWebsiteParamsSchema = z.object({
  startDate: z.string().describe("Start date in YYYY-MM-DD format").optional(),
  endDate: z.string().describe("End date in YYYY-MM-DD format").optional(),
  period: z
    .enum(["daily", "weekly", "monthly"])
    .describe("Aggregation period")
    .default("daily"),
});

// Schema for get_website_trends tool parameters
const getWebsiteTrendsParamsSchema = z.object({
  period: z
    .enum(["daily", "weekly", "monthly"])
    .describe("Filter by period type")
    .optional(),
  limit: z.number().describe("Maximum number of results").default(30),
});

/**
 * Create analytics plugin tools
 */
export function createAnalyticsTools(
  pluginId: string,
  context: ServicePluginContext,
  cloudflareConfig?: CloudflareConfig,
): PluginTool[] {
  const tools: PluginTool[] = [];

  // Only add Cloudflare tools if credentials are configured
  if (cloudflareConfig?.apiToken && cloudflareConfig?.accountId) {
    const cloudflareClient = new CloudflareClient(cloudflareConfig);

    tools.push(
      createTypedTool(
        pluginId,
        "fetch_website",
        "Fetch website analytics from Cloudflare and store as metrics entity. Defaults to yesterday if no dates provided.",
        fetchWebsiteParamsSchema,
        async (input) => {
          // Default to yesterday if no dates provided
          const startDate = input.startDate ?? toISODateString(getYesterday());
          const endDate = input.endDate ?? startDate;
          const period = input.period;

          try {
            // Fetch stats from Cloudflare
            const stats = await cloudflareClient.getWebsiteStats({
              startDate,
              endDate,
            });

            // Create the metrics entity
            const entity = createWebsiteMetricsEntity({
              period,
              startDate,
              endDate,
              pageviews: stats.pageviews,
              visitors: stats.visitors,
              visits: stats.visits,
              bounces: stats.bounces,
              totalTime: stats.totalTime,
            });

            // Upsert the entity (update if exists, create if not)
            const result = await context.entityService.upsertEntity(entity);

            return toolSuccess(
              {
                entityId: result.entityId,
                period,
                startDate,
                endDate,
                pageviews: stats.pageviews,
                visitors: stats.visitors,
                visits: stats.visits,
                created: result.created,
              },
              `Website metrics ${result.created ? "created" : "updated"} for ${startDate}`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolError(msg);
          }
        },
      ),
    );

    tools.push(
      createTypedTool(
        pluginId,
        "get_website_trends",
        "Query stored website metrics to see trends over time.",
        getWebsiteTrendsParamsSchema,
        async (input) => {
          try {
            // Query stored metrics entities
            const entities =
              await context.entityService.listEntities<WebsiteMetricsEntity>(
                "website-metrics",
                {
                  limit: input.limit,
                  sortFields: [{ field: "created", direction: "desc" }],
                  ...(input.period && {
                    filter: { metadata: { period: input.period } },
                  }),
                },
              );

            // Format for display
            const trends = entities.map((e) => ({
              id: e.id,
              period: e.metadata.period,
              startDate: e.metadata.startDate,
              endDate: e.metadata.endDate,
              pageviews: e.metadata.pageviews,
              visitors: e.metadata.visitors,
              visits: e.metadata.visits,
              bounceRate: e.metadata.bounceRate,
              avgTimeOnPage: e.metadata.avgTimeOnPage,
            }));

            return toolSuccess(
              { count: trends.length, trends },
              `Found ${trends.length} metrics records`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolError(msg);
          }
        },
      ),
    );
  }

  return tools;
}
