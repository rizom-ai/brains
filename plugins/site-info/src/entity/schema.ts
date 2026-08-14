import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export {
  siteInfoBodySchema,
  siteInfoCTASchema,
} from "@brains/site-composition";
export type {
  ResolvedSiteInfoBody,
  SiteInfoBody,
  SiteInfoBodyInput,
  SiteInfoCTA,
} from "@brains/site-composition";

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
export const siteInfoSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    id: z.ZodLiteral<"site-info">;
    entityType: z.ZodLiteral<"site-info">;
    metadata: z.ZodType<SiteInfoMetadata>;
  }>
> = baseEntityParserSchema.extend({
  id: z.literal("site-info"),
  entityType: z.literal("site-info"),
  metadata: siteInfoMetadataSchema,
});

/**
 * Site info entity type derived from schema
 */
export type SiteInfoEntity = z.output<typeof siteInfoSchema>;
