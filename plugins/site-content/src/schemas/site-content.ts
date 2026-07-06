import { baseEntityParserSchema, type BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface SiteContentMetadata extends Record<string, unknown> {
  routeId: string;
  sectionId: string;
}

export const siteContentMetadataSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<SiteContentMetadata, SiteContentMetadata> = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

const siteContentEntityMetadataSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<SiteContentMetadata, SiteContentMetadata> = z.object({
  routeId: z.string(),
  sectionId: z.string(),
});

export interface SiteContent extends BaseEntity<SiteContentMetadata> {
  entityType: "site-content";
  template?: string | undefined;
}

export const siteContentSchema: z.ZodType<SiteContent> =
  baseEntityParserSchema.extend({
    entityType: z.literal("site-content"),
    template: z.string().optional(),
    content: z.string(),
    metadata: siteContentEntityMetadataSchema,
  });
