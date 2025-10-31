import { z } from "@brains/utils";
import { siteInfoBodySchema } from "../services/site-info-schema";

/**
 * Schema for site information
 * Extends the body schema with navigation and socialLinks (from profile entity)
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
  socialLinks: z
    .array(
      z.object({
        platform: z
          .enum(["github", "instagram", "linkedin", "email", "website"])
          .describe("Social media platform"),
        url: z.string().describe("Profile or contact URL"),
        label: z.string().optional().describe("Optional display label"),
      }),
    )
    .optional()
    .describe("Social media links from profile entity"),
});

export type SiteInfo = z.infer<typeof SiteInfoSchema>;
