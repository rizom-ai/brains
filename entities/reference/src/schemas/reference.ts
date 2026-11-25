import { z } from "@brains/utils/zod";

/** Draft until a curator selects it; publishing is the editorial choice. */
export const referenceStatusSchema: z.ZodEnum<{
  draft: "draft";
  published: "published";
}> = z.enum(["draft", "published"]);

export type ReferenceStatus = z.output<typeof referenceStatusSchema>;

/** Whether the author still publishes what the reference points to. */
export const referenceSourceStateSchema: z.ZodEnum<{
  active: "active";
  withdrawn: "withdrawn";
}> = z.enum(["active", "withdrawn"]);

export type ReferenceSourceState = z.output<typeof referenceSourceStateSchema>;

type ReferenceMetadataSchema = z.ZodObject<{
  status: typeof referenceStatusSchema;
  title: z.ZodString;
  summary: z.ZodOptional<z.ZodString>;
  author: z.ZodString;
  authorSite: z.ZodString;
  url: z.ZodURL;
  publishedAt: z.ZodString;
  series: z.ZodOptional<z.ZodString>;
  sourceState: typeof referenceSourceStateSchema;
  sourceUri: z.ZodString;
  sourceEntityType: z.ZodString;
  sourceEntityId: z.ZodString;
  sourceBrain: z.ZodOptional<z.ZodString>;
}>;

/**
 * A reference's frontmatter, which is all it stores: what a reader is shown,
 * the curator's choice, and where the entity lives on its author's brain.
 * The body of what it points to is never among them.
 */
export const referenceMetadataSchema: ReferenceMetadataSchema = z.object({
  status: referenceStatusSchema,
  title: z.string(),
  summary: z.string().optional(),
  author: z.string(),
  authorSite: z.string(),
  url: z.url(),
  publishedAt: z.string(),
  series: z.string().optional(),
  sourceState: referenceSourceStateSchema.meta({ studioWidget: "provenance" }),
  sourceUri: z.string().meta({ studioWidget: "provenance" }),
  sourceEntityType: z.string().meta({ studioWidget: "provenance" }),
  sourceEntityId: z.string().meta({ studioWidget: "provenance" }),
  sourceBrain: z.string().optional().meta({ studioWidget: "provenance" }),
});

export type ReferenceMetadata = z.output<typeof referenceMetadataSchema>;
