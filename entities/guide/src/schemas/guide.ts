import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { guideFrontmatterSchema } from "./guide-frontmatter";

// The index card shows every field, so metadata carries the whole frontmatter.
export const guideMetadataSchema: typeof guideFrontmatterSchema =
  guideFrontmatterSchema;

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
