import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Product availability — maturity stage, not a publish workflow status
 */
export const productAvailabilitySchema = z.enum([
  "available",
  "early access",
  "coming soon",
  "planned",
]);
export type ProductAvailability = z.output<typeof productAvailabilitySchema>;

const productAvailabilityParserSchema = z4.enum([
  "available",
  "early access",
  "coming soon",
  "planned",
]);

/**
 * Product feature/capability schema
 */
export const productFeatureSchema = z4.object({
  title: z4.string(),
  description: z4.string(),
});

export type ProductFeature = z4.output<typeof productFeatureSchema>;

/**
 * Product frontmatter schema — minimal: identity + metadata only
 * Descriptive content lives in structured body sections
 */
export const productFrontmatterSchema = z.object({
  name: z.string(),
  availability: productAvailabilitySchema,
  order: z.number(),
  ogImageId: z.string().optional(), // References an image entity for social previews
});

export type ProductFrontmatter = z.output<typeof productFrontmatterSchema>;

/**
 * Product body schema — structured content parsed from markdown sections
 * Contains all descriptive/narrative content that was previously in frontmatter
 */
export const productBodySchema = z4.object({
  tagline: z4.string(),
  promise: z4.string(),
  role: z4.string(),
  purpose: z4.string(),
  audience: z4.string(),
  values: z4.array(z4.string()).min(1),
  features: z4.array(productFeatureSchema).min(1).max(6),
  story: z4.string(),
});

export type ProductBody = z4.output<typeof productBodySchema>;

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

export type ProductMetadata = z.output<typeof productMetadataSchema>;

const productEntityMetadataParserSchema = z4.object({
  name: z4.string(),
  availability: productAvailabilityParserSchema,
  order: z4.number(),
  slug: z4.string(),
});

const productFrontmatterParserSchema = z4.object({
  name: z4.string(),
  availability: productAvailabilityParserSchema,
  order: z4.number(),
  ogImageId: z4.string().optional(),
});

/**
 * Product entity schema (extends BaseEntity)
 */
export const productSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("product"),
  metadata: productEntityMetadataParserSchema,
});

export type Product = z4.output<typeof productSchema>;

/**
 * Product with parsed data (returned by datasource)
 * Body is structured content, not a raw string
 */
export const productWithDataSchema = productSchema.extend({
  frontmatter: productFrontmatterParserSchema,
  body: productBodySchema,
  labels: z4.record(z4.string(), z4.string()),
  ogImageUrl: z4.string().optional(), // Absolute URL for social preview metadata
});

export type ProductWithData = z4.output<typeof productWithDataSchema>;

/**
 * Enriched product (after site-builder enrichment adds url/typeLabel)
 * Schema validates with optional fields — site-builder enriches before rendering
 */
export const enrichedProductSchema = productWithDataSchema.extend({
  url: z4.string().optional(),
  typeLabel: z4.string().optional(),
  listUrl: z4.string().optional(),
  listLabel: z4.string().optional(),
  ogImageUrl: z4.string().optional(),
});

export type EnrichedProduct = z4.output<typeof enrichedProductSchema>;
