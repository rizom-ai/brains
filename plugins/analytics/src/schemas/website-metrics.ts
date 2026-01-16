import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";
import { createHash } from "crypto";

/**
 * Website metrics metadata schema
 * Stores aggregated website analytics for a time period
 */
export const websiteMetricsMetadataSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]),
  startDate: z.string().describe("ISO date (YYYY-MM-DD)"),
  endDate: z.string().describe("ISO date (YYYY-MM-DD)"),
  pageviews: z.number().describe("Total page views"),
  visitors: z.number().describe("Unique visitors"),
  visits: z.number().describe("Total visits/sessions"),
  bounces: z.number().describe("Bounced visits"),
  totalTime: z.number().describe("Total time on site in seconds"),
  bounceRate: z.number().describe("Bounce rate (bounces/visits)"),
  avgTimeOnPage: z.number().describe("Average time per pageview in seconds"),
});

export type WebsiteMetricsMetadata = z.infer<
  typeof websiteMetricsMetadataSchema
>;

/**
 * Website metrics entity schema
 * One entity per time period (daily/weekly/monthly)
 * ID format: "website-metrics-{period}-{startDate}"
 */
export const websiteMetricsSchema = baseEntitySchema.extend({
  entityType: z.literal("website-metrics"),
  metadata: websiteMetricsMetadataSchema,
});

export type WebsiteMetricsEntity = z.infer<typeof websiteMetricsSchema>;

/**
 * Input for creating a website metrics entity
 * bounceRate and avgTimeOnPage are computed automatically
 */
export interface CreateWebsiteMetricsInput {
  period: "daily" | "weekly" | "monthly";
  startDate: string;
  endDate: string;
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totalTime: number;
}

/**
 * Create a website metrics entity
 * Automatically computes bounceRate and avgTimeOnPage
 */
export function createWebsiteMetricsEntity(
  input: CreateWebsiteMetricsInput,
): WebsiteMetricsEntity {
  const now = new Date().toISOString();

  // Compute derived metrics
  const bounceRate = input.visits > 0 ? input.bounces / input.visits : 0;
  const avgTimeOnPage =
    input.pageviews > 0 ? input.totalTime / input.pageviews : 0;

  // Generate ID from period and start date
  const id = `website-metrics-${input.period}-${input.startDate}`;

  // Generate content summary
  const content = `Website metrics for ${input.startDate} to ${input.endDate}`;
  const contentHash = createHash("sha256").update(content).digest("hex");

  return websiteMetricsSchema.parse({
    id,
    entityType: "website-metrics",
    content,
    contentHash,
    created: now,
    updated: now,
    metadata: {
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      pageviews: input.pageviews,
      visitors: input.visitors,
      visits: input.visits,
      bounces: input.bounces,
      totalTime: input.totalTime,
      bounceRate,
      avgTimeOnPage,
    },
  });
}
