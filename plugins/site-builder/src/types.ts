import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Site content metadata schema - routeId and sectionId identify which route/section
 * this content belongs to
 */
export const siteContentMetadataSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

export type SiteContentMetadata = z.infer<typeof siteContentMetadataSchema>;

/**
 * Site content entity schema - single schema for all site content
 */
export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),
  template: z.string().optional(),
  content: z.string(),
  metadata: siteContentMetadataSchema,
});

export type SiteContent = z.infer<typeof siteContentSchema>;
