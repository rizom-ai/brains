import { z } from "@brains/utils/zod-v4";

/**
 * Publish status states
 * - draft: Created but not ready for publishing
 * - queued: Ready to publish, waiting in queue
 * - published: Successfully published
 * - failed: Publish error after max retries
 */
export type PublishStatus = "draft" | "queued" | "published" | "failed";

export const publishStatusSchema: z.ZodType<PublishStatus, PublishStatus> =
  z.enum(["draft", "queued", "published", "failed"]);

/**
 * Publishable metadata fields that plugins should include in their entity metadata.
 * These fields enable queue management and retry tracking.
 */
export interface PublishableMetadata extends Record<string, unknown> {
  status: PublishStatus;
  queueOrder?: number | undefined;
  publishedAt?: string | undefined;
}

export interface PublishableMetadataInput extends Record<string, unknown> {
  status?: PublishStatus | undefined;
  queueOrder?: number | undefined;
  publishedAt?: string | undefined;
}

export const publishableMetadataSchema: z.ZodType<
  PublishableMetadata,
  PublishableMetadataInput
> = z.object({
  status: publishStatusSchema.default("draft"),
  queueOrder: z
    .number()
    .optional()
    .describe("Position in publish queue (lower = sooner)"),
  publishedAt: z.string().datetime().optional(),
});
