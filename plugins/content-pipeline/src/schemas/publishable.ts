import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Publish status states
 * - draft: Created but not ready for publishing
 * - queued: Ready to publish, waiting in queue
 * - published: Successfully published
 * - failed: Publish error after max retries
 */
export const publishStatusSchema: z.ZodEnum<{
  draft: "draft";
  queued: "queued";
  published: "published";
  failed: "failed";
}> = z.enum(["draft", "queued", "published", "failed"]);

export type PublishStatus = z.output<typeof publishStatusSchema>;

type PublishableMetadataSchema = z.ZodObject<
  {
    status: z.ZodDefault<typeof publishStatusSchema>;
    queueOrder: z.ZodOptional<z.ZodNumber>;
    publishedAt: z.ZodOptional<z.ZodString>;
  },
  z.core.$loose
>;

/**
 * Publishable metadata fields that plugins should include in their entity metadata.
 * These fields enable queue management and retry tracking. Entity metadata
 * carries other fields beside these, so the object is loose: parsing keeps
 * them and the type admits them.
 */
export const publishableMetadataSchema: PublishableMetadataSchema =
  z.looseObject({
    status: publishStatusSchema.default("draft"),
    queueOrder: z
      .number()
      .optional()
      .describe("Position in publish queue (lower = sooner)"),
    publishedAt: z.string().datetime().optional(),
  });

export type PublishableMetadata = z.output<typeof publishableMetadataSchema>;
export type PublishableMetadataInput = z.input<
  typeof publishableMetadataSchema
>;

/**
 * Read schema for any entity flowing through the publish pipeline. Loose on
 * metadata: providers receive the full metadata record, so foreign keys must
 * survive the parse.
 */
export const publishableEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    metadata: PublishableMetadataSchema;
  }>
> = baseEntitySchema.extend({
  metadata: publishableMetadataSchema,
});

export type PublishableEntity = z.output<typeof publishableEntitySchema>;
