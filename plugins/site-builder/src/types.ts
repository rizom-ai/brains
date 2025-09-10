import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Site content entity schema - single schema for all site content
 */
export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),
  routeId: z.string(),
  sectionId: z.string(),
  template: z.string().optional(),
  content: z.string(),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
