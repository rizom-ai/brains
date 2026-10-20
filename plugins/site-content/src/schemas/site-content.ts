import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/** A section is addressed by its id, `route:section`; it needs no metadata of its own. */
export const siteContentMetadataSchema: z.ZodObject<
  Record<string, never>,
  z.core.$loose
> = z.looseObject({});

export type SiteContentMetadata = z.output<typeof siteContentMetadataSchema>;

export const siteContentSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"site-content">;
    template: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    metadata: typeof siteContentMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("site-content"),
  template: z.string().optional(),
  content: z.string(),
  metadata: siteContentMetadataSchema,
});

export type SiteContent = z.output<typeof siteContentSchema>;
