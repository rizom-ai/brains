import type { PluginTool, CorePluginContext } from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import { z, toISODateString, getYesterday } from "@brains/utils";
import { CloudflareClient } from "../lib/cloudflare-client";
import type { CloudflareConfig } from "../config";

/**
 * Schema for analytics:query tool parameters
 *
 * Supports multiple ways to specify date range:
 * 1. No params: yesterday only (default)
 * 2. date: single specific day
 * 3. days: last N days from yesterday
 * 4. startDate + endDate: custom range
 */
const queryAnalyticsParamsSchema = z.object({
  date: z.string().describe("Single date in YYYY-MM-DD format").optional(),
  days: z
    .number()
    .min(1)
    .max(365)
    .describe("Number of days back from yesterday (e.g., 7 for last week)")
    .optional(),
  startDate: z
    .string()
    .describe("Start date in YYYY-MM-DD format (use with endDate)")
    .optional(),
  endDate: z
    .string()
    .describe("End date in YYYY-MM-DD format (use with startDate)")
    .optional(),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum items for breakdowns (pages, referrers, countries)"),
});

type QueryAnalyticsParams = z.infer<typeof queryAnalyticsParamsSchema>;

/**
 * Validate parameter combinations
 */
function validateParams(input: QueryAnalyticsParams): string | null {
  // Can't combine date with days or startDate/endDate
  if (input.date && (input.days || input.startDate || input.endDate)) {
    return "Cannot combine 'date' with 'days' or 'startDate'/'endDate'";
  }
  // Can't combine days with startDate/endDate
  if (input.days && (input.startDate || input.endDate)) {
    return "Cannot combine 'days' with 'startDate'/'endDate'";
  }
  // If using custom range, both must be provided
  if (
    (input.startDate && !input.endDate) ||
    (!input.startDate && input.endDate)
  ) {
    return "Both 'startDate' and 'endDate' must be provided for custom range";
  }
  return null;
}

/**
 * Create analytics plugin tools
 */
export function createAnalyticsTools(
  pluginId: string,
  _context: CorePluginContext,
  cloudflareConfig?: CloudflareConfig,
): PluginTool[] {
  const tools: PluginTool[] = [];

  // Only add tools if Cloudflare credentials are configured
  if (!cloudflareConfig?.apiToken || !cloudflareConfig.accountId) {
    return tools;
  }

  const cloudflareClient = new CloudflareClient(cloudflareConfig);

  tools.push(
    createTypedTool(
      pluginId,
      "query",
      `Query website analytics from Cloudflare.

Date range options (use only one):
- No params: yesterday only
- date: single specific day (YYYY-MM-DD)
- days: last N days from yesterday (e.g., 7 for last week, 30 for last month)
- startDate + endDate: custom date range

Returns pageviews, visitors, top pages, referrers, devices, and countries.`,
      queryAnalyticsParamsSchema,
      async (input) => {
        // Validate parameter combinations
        const validationError = validateParams(input);
        if (validationError) {
          return toolError(validationError);
        }

        // Calculate date range based on input
        let startDate: string;
        let endDate: string;

        if (input.date) {
          // Single specific date
          startDate = input.date;
          endDate = input.date;
        } else if (input.startDate && input.endDate) {
          // Custom date range
          startDate = input.startDate;
          endDate = input.endDate;
        } else {
          // Use days parameter (default: 1 = yesterday only)
          const days = input.days ?? 1;
          const end = getYesterday();
          const start = new Date(end);
          start.setDate(start.getDate() - days + 1);
          startDate = toISODateString(start);
          endDate = toISODateString(end);
        }

        const limit = input.limit ?? 20;

        try {
          // Fetch all data from Cloudflare in parallel
          const [stats, topPages, topReferrers, devices, topCountries] =
            await Promise.all([
              cloudflareClient.getWebsiteStats({ startDate, endDate }),
              cloudflareClient.getTopPages({ startDate, endDate, limit }),
              cloudflareClient.getTopReferrers({ startDate, endDate, limit }),
              cloudflareClient.getDeviceBreakdown({ startDate, endDate }),
              cloudflareClient.getTopCountries({ startDate, endDate, limit }),
            ]);

          const rangeDescription =
            startDate === endDate ? startDate : `${startDate} to ${endDate}`;

          return toolSuccess(
            {
              range: { startDate, endDate },
              summary: {
                pageviews: stats.pageviews,
                visitors: stats.visitors,
              },
              topPages,
              topReferrers,
              devices,
              topCountries,
            },
            `Website analytics for ${rangeDescription}`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return toolError(msg);
        }
      },
    ),
  );

  return tools;
}
