import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

export const siteContentMetadataSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

export type SiteContentMetadata = z.infer<typeof siteContentMetadataSchema>;

export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),
  template: z.string().optional(),
  content: z.string(),
  metadata: siteContentMetadataSchema,
});

export type SiteContent = z.infer<typeof siteContentSchema>;
