import { z } from "@brains/utils/zod";
import type {
  SiteLayoutInfo,
  SiteMetadata,
  SiteMetadataCTA,
  SiteMetadataSection,
} from "@rizom/site";
import { NavigationItemSchema } from "./routes";

export type {
  SiteLayoutInfo,
  SiteMetadata,
  SiteMetadataCTA,
  SiteMetadataSection,
} from "@rizom/site";

export const SITE_METADATA_GET_CHANNEL = "site:metadata:get";
export const SITE_METADATA_UPDATED_CHANNEL = "site:metadata:updated";

export const siteMetadataCTASchema: z.ZodType<SiteMetadataCTA> = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

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

type SiteMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
  url: z.ZodOptional<z.ZodString>;
  copyright: z.ZodOptional<z.ZodString>;
  logo: z.ZodOptional<z.ZodBoolean>;
  themeMode: z.ZodOptional<z.ZodEnum<{ light: "light"; dark: "dark" }>>;
  analyticsScript: z.ZodOptional<z.ZodString>;
  cta: z.ZodOptional<typeof siteMetadataCTASchema>;
  sections: z.ZodOptional<
    z.ZodRecord<z.ZodString, typeof siteMetadataSectionSchema>
  >;
}>;

/** Plain site metadata consumed by site renderers. */
export const siteMetadataSchema: SiteMetadataSchema = z.object({
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

type SiteMetadataSchemaOutput = z.infer<typeof siteMetadataSchema>;
type SiteMetadataCTASchemaOutput = z.infer<typeof siteMetadataCTASchema>;

function expectSiteMetadata(value: SiteMetadataSchemaOutput): SiteMetadata {
  return value;
}

function expectSiteMetadataCTA(
  value: SiteMetadataCTASchemaOutput,
): SiteMetadataCTA {
  return value;
}

void expectSiteMetadata;
void expectSiteMetadataCTA;

const socialLinkSchema = z.object({
  platform: z
    .enum(["github", "instagram", "linkedin", "email", "website"])
    .describe("Social media platform"),
  url: z.string().describe("Profile or contact URL"),
  label: z.string().optional().describe("Optional display label"),
});

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
    primary: z.array(NavigationItemSchema),
    secondary: z.array(NavigationItemSchema),
  }),
  socialLinks: z
    .array(socialLinkSchema)
    .optional()
    .describe("Social media links from profile metadata"),
});

type SiteLayoutInfoSchemaOutput = z.infer<typeof siteLayoutInfoSchema>;
function expectSiteLayoutInfo(
  value: SiteLayoutInfoSchemaOutput,
): SiteLayoutInfo {
  return value;
}
void expectSiteLayoutInfo;
