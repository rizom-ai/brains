import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export const siteContentMetadataSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

export type SiteContentMetadata = z.output<typeof siteContentMetadataSchema>;

const siteContentEntityMetadataSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

export const siteContentSchema = baseEntityParserSchema.extend({
  entityType: z.literal("site-content"),
  template: z.string().optional(),
  content: z.string(),
  metadata: siteContentEntityMetadataSchema,
});

export type SiteContent = z.output<typeof siteContentSchema>;
