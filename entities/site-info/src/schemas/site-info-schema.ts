import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export interface SiteInfoMetadata {
  [key: string]: unknown;
}

/**
 * Site info metadata schema - empty as site-info doesn't use metadata for filtering
 */
export const siteInfoMetadataSchema: z.ZodType<SiteInfoMetadata> = z.object({});

/**
 * Site info entity schema
 * Site info data (title, description, CTA, etc.) is stored in content field as structured markdown
 */
const siteInfoEntityMetadataSchema: z.ZodType<SiteInfoMetadata> = z.object({});

export const siteInfoSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    id: z.ZodLiteral<"site-info">;
    entityType: z.ZodLiteral<"site-info">;
    metadata: z.ZodType<SiteInfoMetadata>;
  }>
> = baseEntityParserSchema.extend({
  id: z.literal("site-info"),
  entityType: z.literal("site-info"),
  metadata: siteInfoEntityMetadataSchema,
});

/**
 * Site info entity type derived from schema
 */
export type SiteInfoEntity = z.output<typeof siteInfoSchema>;

export interface SiteInfoCTA {
  heading: string;
  buttonText: string;
  buttonLink: string;
}

type SiteInfoCTASchema = z.ZodObject<{
  heading: z.ZodString;
  buttonText: z.ZodString;
  buttonLink: z.ZodString;
}>;

/**
 * CTA schema - call-to-action configuration.
 *
 * Local durable frontmatter schema for the site-info entity.
 */
export const siteInfoCTASchema: SiteInfoCTASchema = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

export interface SiteInfoSection {
  blurb?: string | undefined;
}

type SiteInfoSectionSchema = z.ZodObject<{
  blurb: z.ZodOptional<z.ZodString>;
}>;

const siteInfoSectionSchema: SiteInfoSectionSchema = z.object({
  blurb: z
    .string()
    .optional()
    .describe("Short italic subtitle under the section title"),
});

export interface SiteInfoBody {
  [key: string]: unknown;
  title: string;
  description: string;
  copyright?: string | undefined;
  logo?: boolean | undefined;
  themeMode?: "light" | "dark" | undefined;
  cta?: SiteInfoCTA | undefined;
  sections?: Record<string, SiteInfoSection> | undefined;
}

export type SiteInfoBodySchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
  copyright: z.ZodOptional<z.ZodString>;
  logo: z.ZodOptional<z.ZodBoolean>;
  themeMode: z.ZodOptional<z.ZodEnum<{ light: "light"; dark: "dark" }>>;
  cta: z.ZodOptional<SiteInfoCTASchema>;
  sections: z.ZodOptional<z.ZodRecord<z.ZodString, SiteInfoSectionSchema>>;
}>;

/**
 * Site info body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const siteInfoBodySchema: SiteInfoBodySchema = z.object({
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
