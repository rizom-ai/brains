import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Site info metadata schema - empty as site-info doesn't use metadata for filtering
 */
export const siteInfoMetadataSchema = z.object({});

export type SiteInfoMetadata = z.infer<typeof siteInfoMetadataSchema>;

/**
 * Site info entity schema
 * Site info data (title, description, CTA, etc.) is stored in content field as structured markdown
 */
export const siteInfoSchema = baseEntitySchema.extend({
  id: z.literal("site-info"),
  entityType: z.literal("site-info"),
  metadata: siteInfoMetadataSchema,
});

/**
 * Site info entity type derived from schema
 */
export type SiteInfoEntity = z.infer<typeof siteInfoSchema>;

/**
 * Site info body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const siteInfoBodySchema = z.object({
  title: z.string().describe("The site's title"),
  description: z.string().describe("The site's description"),
  url: z.string().optional().describe("The site's canonical URL"),
  copyright: z.string().optional().describe("Copyright notice text"),
  themeMode: z
    .enum(["light", "dark"])
    .optional()
    .describe("Default theme mode"),
  cta: z
    .object({
      heading: z.string().describe("Main CTA heading text"),
      buttonText: z.string().describe("Call-to-action button text"),
      buttonLink: z.string().describe("URL or anchor for the CTA button"),
    })
    .optional()
    .describe("Call-to-action configuration"),
});

/**
 * Site info body type
 */
export type SiteInfoBody = z.infer<typeof siteInfoBodySchema>;
