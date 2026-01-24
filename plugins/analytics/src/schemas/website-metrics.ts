import { z } from "@brains/utils";
import {
  baseEntitySchema,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { createHash } from "crypto";

/**
 * Schema for top pages breakdown
 */
export const topPageSchema = z.object({
  path: z.string(),
  views: z.number(),
});

export type TopPage = z.infer<typeof topPageSchema>;

/**
 * Schema for referrer breakdown
 */
export const topReferrerSchema = z.object({
  host: z.string(),
  visits: z.number(),
});

export type TopReferrer = z.infer<typeof topReferrerSchema>;

/**
 * Schema for device breakdown
 */
export const deviceBreakdownSchema = z.object({
  desktop: z.number(),
  mobile: z.number(),
  tablet: z.number(),
});

export type DeviceBreakdown = z.infer<typeof deviceBreakdownSchema>;

/**
 * Schema for country breakdown
 */
export const topCountrySchema = z.object({
  country: z.string(),
  visits: z.number(),
});

export type TopCountry = z.infer<typeof topCountrySchema>;

/**
 * Website metrics frontmatter schema (full data stored in markdown)
 * Contains all analytics data including breakdowns
 * One entity per day - daily snapshots only
 */
export const websiteMetricsFrontmatterSchema = z.object({
  date: z.string().describe("ISO date (YYYY-MM-DD)"),
  pageviews: z.number().describe("Total page views"),
  visitors: z.number().describe("Unique visitors"),

  // Breakdown arrays (stored in frontmatter, not metadata)
  topPages: z.array(topPageSchema),
  topReferrers: z.array(topReferrerSchema),
  devices: deviceBreakdownSchema,
  topCountries: z.array(topCountrySchema),
});

export type WebsiteMetricsFrontmatter = z.infer<
  typeof websiteMetricsFrontmatterSchema
>;

/**
 * Website metrics metadata schema (queryable subset)
 * Derived from frontmatter using .pick()
 */
export const websiteMetricsMetadataSchema =
  websiteMetricsFrontmatterSchema.pick({
    date: true,
    pageviews: true,
    visitors: true,
  });

export type WebsiteMetricsMetadata = z.infer<
  typeof websiteMetricsMetadataSchema
>;

/**
 * Website metrics entity schema
 * One entity per day (daily snapshots only)
 * ID format: "website-metrics-{date}"
 *
 * Note: Breakdowns (topPages, topReferrers, devices, topCountries) are stored
 * in the content field as YAML frontmatter, parsed by the adapter when needed.
 */
export const websiteMetricsSchema = baseEntitySchema.extend({
  entityType: z.literal("website-metrics"),
  metadata: websiteMetricsMetadataSchema,
});

export type WebsiteMetricsEntity = z.infer<typeof websiteMetricsSchema>;

/**
 * Input for creating a website metrics entity
 * Includes core metrics and optional breakdown data
 */
export interface CreateWebsiteMetricsInput {
  date: string;
  pageviews: number;
  visitors: number;
  topPages?: TopPage[];
  topReferrers?: TopReferrer[];
  devices?: DeviceBreakdown;
  topCountries?: TopCountry[];
}

/**
 * Create a website metrics entity
 * Breakdowns are stored in content as YAML frontmatter
 */
export function createWebsiteMetricsEntity(
  input: CreateWebsiteMetricsInput,
): WebsiteMetricsEntity {
  const now = new Date().toISOString();

  // Generate ID from date
  const id = `website-metrics-${input.date}`;

  // Build frontmatter data (all data including breakdowns)
  const frontmatterData: WebsiteMetricsFrontmatter = {
    date: input.date,
    pageviews: input.pageviews,
    visitors: input.visitors,
    topPages: input.topPages ?? [],
    topReferrers: input.topReferrers ?? [],
    devices: input.devices ?? { desktop: 0, mobile: 0, tablet: 0 },
    topCountries: input.topCountries ?? [],
  };

  // Generate markdown body
  const body = `# Website Metrics\n\nWebsite metrics for ${input.date}`;

  // Generate content with YAML frontmatter using helper
  const content = generateMarkdownWithFrontmatter(body, frontmatterData);
  const contentHash = createHash("sha256").update(content).digest("hex");

  return websiteMetricsSchema.parse({
    id,
    entityType: "website-metrics",
    content,
    contentHash,
    created: now,
    updated: now,
    metadata: {
      date: input.date,
      pageviews: input.pageviews,
      visitors: input.visitors,
    },
  });
}
