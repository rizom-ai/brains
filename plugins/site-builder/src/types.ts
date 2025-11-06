import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Site content metadata schema - empty as site-content doesn't use metadata for filtering
 * (routeId and sectionId are already top-level entity fields)
 */
export const siteContentMetadataSchema = z.object({});

export type SiteContentMetadata = z.infer<typeof siteContentMetadataSchema>;

/**
 * Site content entity schema - single schema for all site content
 */
export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),
  routeId: z.string(),
  sectionId: z.string(),
  template: z.string().optional(),
  content: z.string(),
  metadata: siteContentMetadataSchema,
});

export type SiteContent = z.infer<typeof siteContentSchema>;
