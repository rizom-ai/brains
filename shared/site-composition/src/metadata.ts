import { z } from "@brains/utils/zod-v4";

export const SITE_METADATA_GET_CHANNEL = "site:metadata:get";
export const SITE_METADATA_UPDATED_CHANNEL = "site:metadata:updated";

export interface SiteMetadataCTA {
  heading: string;
  buttonText: string;
  buttonLink: string;
}

export const siteMetadataCTASchema: z.ZodType<SiteMetadataCTA> = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

export interface SiteMetadataSection {
  blurb?: string | undefined;
}

/** Per-section homepage descriptors — short editorial blurbs displayed
 * beneath each section title (e.g. under "Essays"). Keys match section ids
 * the homepage template knows about ("essays", "presentations", "about", …).
 */
export const siteMetadataSectionSchema: z.ZodType<SiteMetadataSection> =
  z.object({
    blurb: z
      .string()
      .optional()
      .describe("Short italic subtitle under the section title"),
  });

export interface SiteMetadata {
  title: string;
  description: string;
  url?: string | undefined;
  copyright?: string | undefined;
  logo?: boolean | undefined;
  themeMode?: "light" | "dark" | undefined;
  analyticsScript?: string | undefined;
  cta?: SiteMetadataCTA | undefined;
  sections?: Record<string, SiteMetadataSection> | undefined;
}

/** Plain site metadata consumed by site renderers. */
export const siteMetadataSchema: z.ZodType<SiteMetadata> = z.object({
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
  sections: z
    .record(z.string(), siteMetadataSectionSchema)
    .optional()
    .describe(
      "Optional per-section blurbs, keyed by section id (e.g. 'essays', 'presentations', 'about'). Used by homepage templates that render editorial section headers.",
    ),
});

export interface SiteLayoutNavigationItem {
  label: string;
  href: string;
  priority: number;
}

const siteLayoutNavigationItemSchema: z.ZodType<SiteLayoutNavigationItem> =
  z.object({
    label: z.string(),
    href: z.string(),
    priority: z.number(),
  });

export interface SocialLink {
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label?: string | undefined;
}

const socialLinkSchema: z.ZodType<SocialLink> = z.object({
  platform: z
    .enum(["github", "instagram", "linkedin", "email", "website"])
    .describe("Social media platform"),
  url: z.string().describe("Profile or contact URL"),
  label: z.string().optional().describe("Optional display label"),
});

export interface SiteLayoutInfo extends Omit<SiteMetadata, "copyright"> {
  navigation: {
    primary: SiteLayoutNavigationItem[];
    secondary: SiteLayoutNavigationItem[];
  };
  copyright: string;
  socialLinks?: SocialLink[] | undefined;
}

/** Complete site information passed to layout components. */
export const siteLayoutInfoSchema: z.ZodType<SiteLayoutInfo> = z.object({
  title: z.string().describe("The site's title"),
  description: z.string().describe("The site's description"),
  url: z.string().optional().describe("Canonical site URL"),
  copyright: z.string(),
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
  sections: z
    .record(z.string(), siteMetadataSectionSchema)
    .optional()
    .describe(
      "Optional per-section blurbs, keyed by section id (e.g. 'essays', 'presentations', 'about'). Used by homepage templates that render editorial section headers.",
    ),
  navigation: z.object({
    primary: z.array(siteLayoutNavigationItemSchema),
    secondary: z.array(siteLayoutNavigationItemSchema),
  }),
  socialLinks: z
    .array(socialLinkSchema)
    .optional()
    .describe("Social media links from profile metadata"),
});
