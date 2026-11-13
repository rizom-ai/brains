import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  guideFrontmatterSchema,
  guideMaterialSchema,
  guideRecipeSchema,
} from "./guide-frontmatter";

/**
 * A guide's metadata: its whole frontmatter, since the index card shows
 * every field, with each field it may leave unset stored as null. Every
 * field is required here, so a row stored before a field existed reads with
 * the metadata its file states until the boot pass rewrites it, and writes
 * keep what the file says.
 */
export const guideMetadataSchema: z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  order: z.ZodNumber;
  persona: z.ZodString;
  for: z.ZodString;
  recipe: z.ZodNullable<typeof guideRecipeSchema>;
  brings: z.ZodNullable<z.ZodArray<z.ZodString>>;
  section: z.ZodNullable<z.ZodString>;
  summary: z.ZodNullable<z.ZodString>;
  material: z.ZodArray<typeof guideMaterialSchema>;
}> = z.object({
  title: z.string(),
  slug: z.string(),
  order: z.number().int(),
  persona: z.string(),
  for: z.string(),
  recipe: guideRecipeSchema.nullable(),
  brings: z.array(z.string().min(1)).min(1).nullable(),
  section: z.string().min(1).nullable(),
  summary: z.string().min(1).nullable(),
  material: z.array(guideMaterialSchema),
});

export type GuideMetadata = z.output<typeof guideMetadataSchema>;

export const guideSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"guide">;
    metadata: typeof guideMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("guide"),
  metadata: guideMetadataSchema,
});

export type Guide = z.output<typeof guideSchema>;

export const guideWithDataSchema: ReturnType<
  typeof guideSchema.extend<{
    frontmatter: typeof guideFrontmatterSchema;
    body: z.ZodString;
  }>
> = guideSchema.extend({
  frontmatter: guideFrontmatterSchema,
  body: z.string(),
});

export type GuideWithData = z.output<typeof guideWithDataSchema>;
