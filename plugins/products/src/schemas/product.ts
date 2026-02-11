import { z } from "zod";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Product availability — maturity stage, not a publish workflow status
 */
export const productAvailabilitySchema = z.enum([
  "available",
  "early access",
  "coming soon",
  "planned",
]);
export type ProductAvailability = z.infer<typeof productAvailabilitySchema>;

/**
 * Product feature/capability schema
 */
export const productFeatureSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type ProductFeature = z.infer<typeof productFeatureSchema>;

/**
 * Product frontmatter schema — minimal: identity + metadata only
 * Descriptive content lives in structured body sections
 */
export const productFrontmatterSchema = z.object({
  name: z.string(),
  availability: productAvailabilitySchema,
  order: z.number(),
});

export type ProductFrontmatter = z.infer<typeof productFrontmatterSchema>;

/**
 * Product body schema — structured content parsed from markdown sections
 * Contains all descriptive/narrative content that was previously in frontmatter
 */
export const productBodySchema = z.object({
  tagline: z.string(),
  promise: z.string(),
  role: z.string(),
  purpose: z.string(),
  audience: z.string(),
  values: z.array(z.string()).min(1),
  features: z.array(productFeatureSchema).min(1).max(6),
  story: z.string(),
});

export type ProductBody = z.infer<typeof productBodySchema>;

/**
 * Product metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 */
export const productMetadataSchema = productFrontmatterSchema
  .pick({
    name: true,
    availability: true,
    order: true,
  })
  .extend({
    slug: z.string(),
  });

export type ProductMetadata = z.infer<typeof productMetadataSchema>;

/**
 * Product entity schema (extends BaseEntity)
 */
export const productSchema = baseEntitySchema.extend({
  entityType: z.literal("product"),
  metadata: productMetadataSchema,
});

export type Product = z.infer<typeof productSchema>;

/**
 * Product with parsed data (returned by datasource)
 * Body is structured content, not a raw string
 */
export const productWithDataSchema = productSchema.extend({
  frontmatter: productFrontmatterSchema,
  body: productBodySchema,
  labels: z.record(z.string(), z.string()),
});

export type ProductWithData = z.infer<typeof productWithDataSchema>;

/**
 * Enriched product (after site-builder enrichment adds url/typeLabel)
 * Schema validates with optional fields — site-builder enriches before rendering
 */
export const enrichedProductSchema = productWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
});

export type EnrichedProduct = z.infer<typeof enrichedProductSchema>;
