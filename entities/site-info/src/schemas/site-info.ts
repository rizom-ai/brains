import { z } from "@brains/utils/zod-v4";

const siteInfoCTASchema = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

const siteInfoSectionSchema = z.object({
  blurb: z
    .string()
    .optional()
    .describe("Short italic subtitle under the section title"),
});

const siteInfoBodySchema = z.object({
  title: z.string().describe("The site's title"),
  description: z.string().describe("The site's description"),
  copyright: z.string().optional().describe("Copyright notice text"),
  logo: z
    .boolean()
    .optional()
    .describe("Whether to display logo instead of title text in header"),
  themeMode: z
    .enum(["light", "dark"])
    .optional()
    .describe("Default theme mode"),
  cta: siteInfoCTASchema.optional().describe("Call-to-action configuration"),
  sections: z
    .record(z.string(), siteInfoSectionSchema)
    .optional()
    .describe(
      "Optional per-section blurbs, keyed by section id (e.g. 'essays', 'presentations', 'about'). Used by homepage templates that render editorial section headers.",
    ),
});

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
