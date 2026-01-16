import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";
import { createHash } from "crypto";

/**
 * Social metrics metadata schema
 * Stores engagement metrics for a social media post
 */
export const socialMetricsMetadataSchema = z.object({
  platform: z.enum(["linkedin"]).describe("Social media platform"),
  entityId: z.string().describe("Reference to social-post entity"),
  platformPostId: z.string().describe("Platform-specific post ID (e.g., URN)"),
  snapshotDate: z.string().datetime().describe("When metrics were captured"),
  impressions: z.number().describe("Total impressions/views"),
  likes: z.number().describe("Number of likes/reactions"),
  comments: z.number().describe("Number of comments"),
  shares: z.number().describe("Number of shares/reposts"),
  engagementRate: z
    .number()
    .describe("(likes + comments + shares) / impressions"),
});

export type SocialMetricsMetadata = z.infer<typeof socialMetricsMetadataSchema>;

/**
 * Social metrics entity schema
 * One entity per post, updated with latest metrics
 * ID format: "social-metrics-{sanitized-platformPostId}"
 */
export const socialMetricsSchema = baseEntitySchema.extend({
  entityType: z.literal("social-metrics"),
  metadata: socialMetricsMetadataSchema,
});

export type SocialMetricsEntity = z.infer<typeof socialMetricsSchema>;

/**
 * Input for creating a social metrics entity
 * engagementRate is computed automatically
 */
export interface CreateSocialMetricsInput {
  platform: "linkedin";
  entityId: string;
  platformPostId: string;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Sanitize platformPostId for use in entity ID
 * Replaces colons with hyphens
 */
function sanitizeIdPart(value: string): string {
  return value.replace(/:/g, "-");
}

/**
 * Create a social metrics entity
 * Automatically computes engagementRate
 */
export function createSocialMetricsEntity(
  input: CreateSocialMetricsInput,
): SocialMetricsEntity {
  const now = new Date().toISOString();

  // Compute engagement rate
  const totalEngagement = input.likes + input.comments + input.shares;
  const engagementRate =
    input.impressions > 0 ? totalEngagement / input.impressions : 0;

  // Generate ID from sanitized platformPostId
  const id = `social-metrics-${sanitizeIdPart(input.platformPostId)}`;

  // Generate content summary
  const content = `Social metrics for ${input.platform} post ${input.platformPostId}`;
  const contentHash = createHash("sha256").update(content).digest("hex");

  return socialMetricsSchema.parse({
    id,
    entityType: "social-metrics",
    content,
    contentHash,
    created: now,
    updated: now,
    metadata: {
      platform: input.platform,
      entityId: input.entityId,
      platformPostId: input.platformPostId,
      snapshotDate: now,
      impressions: input.impressions,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      engagementRate,
    },
  });
}
