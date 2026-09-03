import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export const siteContentMetadataSchema: z.ZodObject<
  { routeId: z.ZodString; sectionId: z.ZodString },
  z.core.$loose
> = z.looseObject({
  routeId: z.string(),
  sectionId: z.string(),
});

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
