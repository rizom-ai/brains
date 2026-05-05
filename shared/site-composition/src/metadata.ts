import { z } from "@brains/utils";

export const SITE_METADATA_GET_CHANNEL = "site:metadata:get";
export const SITE_METADATA_UPDATED_CHANNEL = "site:metadata:updated";

export const siteMetadataCTASchema = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

/** Plain site metadata consumed by site renderers. */
export const siteMetadataSchema = z.object({
  title: z.string().describe("The site's title"),
  description: z.string().describe("The site's description"),
  url: z.string().optional().describe("Canonical site URL"),
  copyright: z.string().optional().describe("Copyright notice text"),
  logo: z
    .boolean()
    .optional()
    .describe("Whether to display logo instead of title text in header"),
  themeMode: z
    .enum(["light", "dark"])
    .optional()
    .describe("Default theme mode"),
  analyticsScript: z.string().optional().describe("Analytics script HTML"),
  cta: siteMetadataCTASchema
    .optional()
    .describe("Call-to-action configuration"),
});

export type SiteMetadata = z.infer<typeof siteMetadataSchema>;
export type SiteMetadataCTA = z.infer<typeof siteMetadataCTASchema>;

const navigationItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  priority: z.number(),
});

const socialLinkSchema = z.object({
  platform: z
    .enum(["github", "instagram", "linkedin", "email", "website"])
    .describe("Social media platform"),
  url: z.string().describe("Profile or contact URL"),
  label: z.string().optional().describe("Optional display label"),
});

/** Complete site information passed to layout components. */
export const siteLayoutInfoSchema = siteMetadataSchema.extend({
  navigation: z.object({
    primary: z.array(navigationItemSchema),
    secondary: z.array(navigationItemSchema),
  }),
  copyright: z.string(),
  socialLinks: z
    .array(socialLinkSchema)
    .optional()
    .describe("Social media links from profile metadata"),
});

export type SiteLayoutInfo = z.infer<typeof siteLayoutInfoSchema>;
