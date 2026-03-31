import type { InsightHandler } from "@brains/plugins";
import { toISODateString, getYesterday } from "@brains/utils";
import type { CloudflareClient } from "../lib/cloudflare-client";

const OVERVIEW_DAYS = 7;
const TOP_PAGES_LIMIT = 10;

/**
 * Create the traffic-overview insight handler.
 * Returns recent traffic summary from Cloudflare Web Analytics.
 * Gracefully degrades when client is unavailable or API fails.
 */
export function createTrafficOverviewInsight(
  client: CloudflareClient | undefined,
): InsightHandler {
  return async () => {
    if (!client) {
      return {
        unavailable: true,
        reason: "Cloudflare analytics not configured",
      };
    }

    const end = getYesterday();
    const start = new Date(end);
    start.setDate(start.getDate() - OVERVIEW_DAYS + 1);

    const startDate = toISODateString(start);
    const endDate = toISODateString(end);

    try {
      const [stats, topPages] = await Promise.all([
        client.getWebsiteStats({ startDate, endDate }),
        client.getTopPages({ startDate, endDate, limit: TOP_PAGES_LIMIT }),
      ]);

      return {
        days: OVERVIEW_DAYS,
        startDate,
        endDate,
        pageviews: stats.pageviews,
        visitors: stats.visitors,
        topPages,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Failed to fetch analytics",
        days: OVERVIEW_DAYS,
      };
    }
  };
}
