import { z } from "@brains/utils";
import {
  baseEntitySchema,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import { createHash } from "crypto";

/**
 * Schema for history entry (daily pageviews)
 */
export const historyEntrySchema = z.object({
  date: z.string(),
  views: z.number(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/**
 * Page metrics frontmatter schema (full data stored in markdown)
 * Tracks pageviews for a specific path over time
 */
export const pageMetricsFrontmatterSchema = z.object({
  path: z.string().describe("URL path (e.g., /essays/my-post)"),
  totalPageviews: z.number().describe("Total pageviews across all time"),
  lastUpdated: z.string().describe("ISO date of last update"),

  // Rolling history (last 30 days)
  history: z.array(historyEntrySchema).default([]),
});

export type PageMetricsFrontmatter = z.infer<
  typeof pageMetricsFrontmatterSchema
>;

/**
 * Page metrics metadata schema (queryable subset)
 * Derived from frontmatter using .pick()
 */
export const pageMetricsMetadataSchema = pageMetricsFrontmatterSchema.pick({
  path: true,
  totalPageviews: true,
  lastUpdated: true,
});

export type PageMetricsMetadata = z.infer<typeof pageMetricsMetadataSchema>;

/**
 * Page metrics entity schema
 * One entity per unique path
 * ID format: "page-metrics-{path-slug}"
 */
export const pageMetricsSchema = baseEntitySchema.extend({
  entityType: z.literal("page-metrics"),
  metadata: pageMetricsMetadataSchema,
});

export type PageMetricsEntity = z.infer<typeof pageMetricsSchema>;

/**
 * Input for creating/updating a page metrics entity
 */
export interface CreatePageMetricsInput {
  path: string;
  views: number;
  date: string;
  existingHistory?: HistoryEntry[];
  existingTotal?: number;
}

/**
 * Generate entity ID from path
 * Converts path to a slug-like format
 */
function pathToId(path: string): string {
  if (path === "/") return "page-metrics-root";

  // Remove leading slash and convert remaining slashes to dashes
  const slug = path
    .replace(/^\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");

  return `page-metrics-${slug}`;
}

/**
 * Create a page metrics entity
 * Handles both new entities and updates to existing ones
 */
export function createPageMetricsEntity(
  input: CreatePageMetricsInput,
): PageMetricsEntity {
  const now = new Date().toISOString();
  const id = pathToId(input.path);

  // Build history - add new entry and limit to 30 days
  const newEntry: HistoryEntry = { date: input.date, views: input.views };
  const existingHistory = input.existingHistory ?? [];

  // Check if we already have an entry for this date (update it instead of adding)
  const historyWithoutToday = existingHistory.filter(
    (h) => h.date !== input.date,
  );
  const updatedHistory = [newEntry, ...historyWithoutToday].slice(0, 30);

  // Calculate total
  const existingTotal = input.existingTotal ?? 0;
  const totalPageviews = existingTotal + input.views;

  // Build frontmatter
  const frontmatterData: PageMetricsFrontmatter = {
    path: input.path,
    totalPageviews,
    lastUpdated: input.date,
    history: updatedHistory,
  };

  // Generate markdown body
  const body = `# Page Metrics\n\nMetrics for ${input.path}`;

  // Generate content with YAML frontmatter
  const content = generateMarkdownWithFrontmatter(body, frontmatterData);
  const contentHash = createHash("sha256").update(content).digest("hex");

  return pageMetricsSchema.parse({
    id,
    entityType: "page-metrics",
    content,
    contentHash,
    created: now,
    updated: now,
    metadata: {
      path: input.path,
      totalPageviews,
      lastUpdated: input.date,
    },
  });
}
