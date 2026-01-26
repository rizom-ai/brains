import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import { z, toISODateString, getYesterday } from "@brains/utils";
import { CloudflareClient } from "../lib/cloudflare-client";
import type { CloudflareConfig } from "../config";
import type { WebsiteMetricsEntity } from "../schemas/website-metrics";

// Schema for query_website tool parameters
const queryWebsiteParamsSchema = z.object({
  date: z
    .string()
    .describe("Single date in YYYY-MM-DD format (use this OR days, not both)")
    .optional(),
  days: z
    .number()
    .describe(
      "Number of days to query (e.g., 7 for last week). Defaults to 1 (yesterday only)",
    )
    .optional(),
});

// Schema for get_website_trends tool parameters
const getWebsiteTrendsParamsSchema = z.object({
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
  if (cloudflareConfig?.apiToken && cloudflareConfig.accountId) {
    const cloudflareClient = new CloudflareClient(cloudflareConfig);

    tools.push(
      createTypedTool(
        pluginId,
        "query_website",
        "Query website analytics from Cloudflare. Use 'date' for a single day or 'days' for a range (e.g., days=7 for last week). Does not store data - use cron for storage.",
        queryWebsiteParamsSchema,
        async (input) => {
          // Calculate date range
          let startDate: string;
          let endDate: string;

          if (input.date) {
            // Single specific date
            startDate = input.date;
            endDate = input.date;
          } else {
            // Use days parameter (default: 1 = yesterday only)
            const days = input.days ?? 1;
            const end = getYesterday();
            const start = new Date(end);
            start.setDate(start.getDate() - days + 1);
            startDate = toISODateString(start);
            endDate = toISODateString(end);
          }

          try {
            // Fetch all data from Cloudflare in parallel
            const [stats, topPages, topReferrers, devices, topCountries] =
              await Promise.all([
                cloudflareClient.getWebsiteStats({ startDate, endDate }),
                cloudflareClient.getTopPages({ startDate, endDate, limit: 20 }),
                cloudflareClient.getTopReferrers({
                  startDate,
                  endDate,
                  limit: 20,
                }),
                cloudflareClient.getDeviceBreakdown({ startDate, endDate }),
                cloudflareClient.getTopCountries({
                  startDate,
                  endDate,
                  limit: 20,
                }),
              ]);

            return toolSuccess(
              {
                startDate,
                endDate,
                pageviews: stats.pageviews,
                visitors: stats.visitors,
                topPages,
                topReferrers,
                devices,
                topCountries,
              },
              `Website analytics for ${startDate === endDate ? startDate : `${startDate} to ${endDate}`}`,
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
        "Query stored daily website metrics to see trends over time.",
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
                },
              );

            // Format for display
            const trends = entities.map((e) => ({
              id: e.id,
              date: e.metadata.date,
              pageviews: e.metadata.pageviews,
              visitors: e.metadata.visitors,
            }));

            return toolSuccess(
              { count: trends.length, trends },
              `Found ${trends.length} daily metrics records`,
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
