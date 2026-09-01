import {
  defineTool,
  type ServiceToolDefinition,
  z,
} from "@brains/sdk/services";
import { toISODateString, getYesterday } from "@brains/utils/date";
import type { CloudflareClient } from "../lib/cloudflare-client";

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

const queryAnalyticsOutputSchema = z.object({
  range: z.object({ startDate: z.string(), endDate: z.string() }),
  summary: z.object({ pageviews: z.number(), visitors: z.number() }),
  topPages: z.array(z.object({ path: z.string(), views: z.number() })),
  topReferrers: z.array(z.object({ host: z.string(), visits: z.number() })),
  devices: z.object({
    desktop: z.number(),
    mobile: z.number(),
    tablet: z.number(),
  }),
  topCountries: z.array(z.object({ country: z.string(), visits: z.number() })),
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

function resolveRange(input: QueryAnalyticsParams): {
  startDate: string;
  endDate: string;
} {
  if (input.date) {
    // Single specific date
    return { startDate: input.date, endDate: input.date };
  }
  if (input.startDate && input.endDate) {
    // Custom date range
    return { startDate: input.startDate, endDate: input.endDate };
  }
  // Use days parameter (default: 1 = yesterday only)
  const days = input.days ?? 1;
  const end = getYesterday();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return { startDate: toISODateString(start), endDate: toISODateString(end) };
}

/**
 * Create analytics plugin tools
 */
export function createAnalyticsTools(
  cloudflareClient: CloudflareClient | undefined,
): ServiceToolDefinition[] {
  if (!cloudflareClient) {
    return [];
  }

  return [
    defineTool({
      name: "query",
      description: `Query website analytics from Cloudflare.

Date range options (use only one):
- No params: yesterday only
- date: single specific day (YYYY-MM-DD)
- days: last N days from yesterday (e.g., 7 for last week, 30 for last month)
- startDate + endDate: custom date range

Returns pageviews, visitors, top pages, referrers, devices, and countries.`,
      input: queryAnalyticsParamsSchema,
      output: queryAnalyticsOutputSchema,
      sideEffects: "none",
      // A human asks for a readout over MCP; the agent has no business
      // querying traffic on its own initiative.
      agentTool: false,
      execute: async ({ input }) => {
        const validationError = validateParams(input);
        if (validationError) {
          throw new Error(validationError);
        }

        const { startDate, endDate } = resolveRange(input);
        const limit = input.limit;

        // Fetch all data from Cloudflare in parallel
        const [stats, topPages, topReferrers, devices, topCountries] =
          await Promise.all([
            cloudflareClient.getWebsiteStats({ startDate, endDate }),
            cloudflareClient.getTopPages({ startDate, endDate, limit }),
            cloudflareClient.getTopReferrers({ startDate, endDate, limit }),
            cloudflareClient.getDeviceBreakdown({ startDate, endDate }),
            cloudflareClient.getTopCountries({ startDate, endDate, limit }),
          ]);

        return {
          range: { startDate, endDate },
          summary: {
            pageviews: stats.pageviews,
            visitors: stats.visitors,
          },
          topPages,
          topReferrers,
          devices,
          topCountries,
        };
      },
    }),
  ];
}
