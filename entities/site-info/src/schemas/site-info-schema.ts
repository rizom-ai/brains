import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  siteMetadataCTASchema,
  siteMetadataSchema,
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

/**
 * CTA schema - call-to-action configuration.
 */
export const siteInfoCTASchema: typeof siteMetadataCTASchema =
  siteMetadataCTASchema;

type SiteInfoBaseSchema = ReturnType<
  typeof siteMetadataSchema.omit<{
    url: true;
    analyticsScript: true;
  }>
>;

const siteInfoBaseSchema: SiteInfoBaseSchema = siteMetadataSchema.omit({
  url: true,
  analyticsScript: true,
});

type SiteInfoBodySchema = ReturnType<
  typeof siteInfoBaseSchema.extend<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
  }>
>;

export const siteInfoBodySchema: SiteInfoBodySchema = siteInfoBaseSchema.extend(
  {
    title: z.string().optional().describe("Optional site title override"),
    description: z
      .string()
      .optional()
      .describe("Optional site description override"),
  },
);

/**
 * Site info body type
 */
export type SiteInfoBody = z.output<typeof siteInfoBodySchema>;
export type SiteInfoBodyInput = z.input<typeof siteInfoBodySchema>;
export type ResolvedSiteInfoBody = SiteInfoBody & {
  title: string;
  description: string;
};

/**
 * CTA configuration type
 */
export type SiteInfoCTA = NonNullable<SiteInfoBody["cta"]>;
