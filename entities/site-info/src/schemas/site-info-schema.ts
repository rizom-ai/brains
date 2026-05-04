import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";
import {
  siteMetadataCTASchema,
  siteMetadataSchema,
} from "@brains/site-composition";

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
 * CTA schema - call-to-action configuration
 */
export const siteInfoCTASchema = siteMetadataCTASchema;

/**
 * Site info body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const siteInfoBodySchema = siteMetadataSchema.omit({
  url: true,
  analyticsScript: true,
});

/**
 * Site info body type
 */
export type SiteInfoBody = z.infer<typeof siteInfoBodySchema>;

/**
 * CTA configuration type
 */
export type SiteInfoCTA = NonNullable<SiteInfoBody["cta"]>;
