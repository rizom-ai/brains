import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";

export const siteContentMetadataSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

export type SiteContentMetadata = z.output<typeof siteContentMetadataSchema>;

const siteContentEntityMetadataSchema = z4.object({
  routeId: z4.string(),
  sectionId: z4.string(),
});

export const siteContentSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("site-content"),
  template: z4.string().optional(),
  content: z4.string(),
  metadata: siteContentEntityMetadataSchema,
});

export type SiteContent = z4.output<typeof siteContentSchema>;
