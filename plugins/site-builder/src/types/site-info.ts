import { z } from "@brains/utils";
import { siteInfoBodySchema } from "../services/site-info-schema";

/**
 * Schema for site information
 * Extends the body schema with navigation (added by datasource)
 */
export const SiteInfoSchema = siteInfoBodySchema.extend({
  navigation: z.object({
    primary: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
        priority: z.number(),
      }),
    ),
    secondary: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
        priority: z.number(),
      }),
    ),
  }),
  copyright: z.string(), // Override: datasource always provides copyright (uses default if not in entity)
});

export type SiteInfo = z.infer<typeof SiteInfoSchema>;
