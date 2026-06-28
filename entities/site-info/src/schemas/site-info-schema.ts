import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";

/**
 * Site info metadata schema - empty as site-info doesn't use metadata for filtering
 */
export const siteInfoMetadataSchema = z.object({});

export type SiteInfoMetadata = z.output<typeof siteInfoMetadataSchema>;

/**
 * Site info entity schema
 * Site info data (title, description, CTA, etc.) is stored in content field as structured markdown
 */
const siteInfoEntityMetadataSchema = z4.object({});

export const siteInfoSchema = baseEntityParserSchema.extend({
  id: z4.literal("site-info"),
  entityType: z4.literal("site-info"),
  metadata: siteInfoEntityMetadataSchema,
});

/**
 * Site info entity type derived from schema
 */
export type SiteInfoEntity = z4.output<typeof siteInfoSchema>;

/**
 * CTA schema - call-to-action configuration.
 *
 * Kept as a local main-Zod schema because site-info is still a durable
 * entity/frontmatter boundary. The shared site-composition metadata schema is
 * Zod 4-owned and must not be composed into this main-Zod schema tree.
 */
export const siteInfoCTASchema = z.object({
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

/**
 * Site info body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const siteInfoBodySchema = z.object({
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
 * Site info body type
 */
export type SiteInfoBody = z.output<typeof siteInfoBodySchema>;

/**
 * CTA configuration type
 */
export type SiteInfoCTA = NonNullable<SiteInfoBody["cta"]>;
