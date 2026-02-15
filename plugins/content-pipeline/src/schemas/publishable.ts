import { z } from "@brains/utils";

/**
 * Publish status states
 * - draft: Created but not ready for publishing
 * - queued: Ready to publish, waiting in queue
 * - published: Successfully published
 * - failed: Publish error after max retries
 */
export const publishStatusSchema = z.enum([
  "draft",
  "queued",
  "published",
  "failed",
]);

export type PublishStatus = z.infer<typeof publishStatusSchema>;

/**
 * Publishable metadata fields that plugins should include in their entity metadata.
 * These fields enable queue management and retry tracking.
 */
export const publishableMetadataSchema = z.object({
  status: publishStatusSchema.default("draft"),
  queueOrder: z
    .number()
    .optional()
    .describe("Position in publish queue (lower = sooner)"),
  publishedAt: z.string().datetime().optional(),
});

export type PublishableMetadata = z.infer<typeof publishableMetadataSchema>;
