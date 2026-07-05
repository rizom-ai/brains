import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Product availability — maturity stage, not a publish workflow status
 */
export type ProductAvailability =
  "available" | "early access" | "coming soon" | "planned";

export const productAvailabilitySchema: z.ZodType<
  ProductAvailability,
  ProductAvailability
> = z.enum(["available", "early access", "coming soon", "planned"]);

const productAvailabilityParserSchema: z.ZodType<
  ProductAvailability,
  ProductAvailability
> = z.enum(["available", "early access", "coming soon", "planned"]);

/**
 * Product feature/capability schema
 */
type ProductFeatureSchema = z.ZodObject<{
  title: z.ZodString;
  description: z.ZodString;
}>;

export const productFeatureSchema: ProductFeatureSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export type ProductFeature = z.output<typeof productFeatureSchema>;

/**
 * Product frontmatter schema — minimal: identity + metadata only
 * Descriptive content lives in structured body sections
 */
type ProductFrontmatterSchema = z.ZodObject<{
  name: z.ZodString;
  availability: z.ZodType<ProductAvailability, ProductAvailability>;
  order: z.ZodNumber;
  ogImageId: z.ZodOptional<z.ZodString>;
}>;

export const productFrontmatterSchema: ProductFrontmatterSchema = z.object({
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
type ProductBodySchema = z.ZodObject<{
  tagline: z.ZodString;
  promise: z.ZodString;
  role: z.ZodString;
  purpose: z.ZodString;
  audience: z.ZodString;
  values: z.ZodArray<z.ZodString>;
  features: z.ZodArray<ProductFeatureSchema>;
  story: z.ZodString;
}>;

export const productBodySchema: ProductBodySchema = z.object({
  tagline: z.string(),
  promise: z.string(),
  role: z.string(),
  purpose: z.string(),
  audience: z.string(),
  values: z.array(z.string()).min(1),
  features: z.array(productFeatureSchema).min(1).max(6),
  story: z.string(),
});

export type ProductBody = z.output<typeof productBodySchema>;

/**
 * Product metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 */
type ProductMetadataSchema = z.ZodObject<{
  name: z.ZodString;
  availability: z.ZodType<ProductAvailability, ProductAvailability>;
  order: z.ZodNumber;
  slug: z.ZodString;
}>;

export const productMetadataSchema: ProductMetadataSchema =
  productFrontmatterSchema
    .pick({
      name: true,
      availability: true,
      order: true,
    })
    .extend({
      slug: z.string(),
    });

export type ProductMetadata = z.output<typeof productMetadataSchema>;

const productEntityMetadataParserSchema: z.ZodObject<{
  name: z.ZodString;
  availability: z.ZodType<ProductAvailability, ProductAvailability>;
  order: z.ZodNumber;
  slug: z.ZodString;
}> = z.object({
  name: z.string(),
  availability: productAvailabilityParserSchema,
  order: z.number(),
  slug: z.string(),
});

const productFrontmatterParserSchema: ProductFrontmatterSchema = z.object({
  name: z.string(),
  availability: productAvailabilityParserSchema,
  order: z.number(),
  ogImageId: z.string().optional(),
});

/**
 * Product entity schema (extends BaseEntity)
 */
export const productSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"product">;
    metadata: typeof productEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("product"),
  metadata: productEntityMetadataParserSchema,
});

export type Product = z.output<typeof productSchema>;

/**
 * Product with parsed data (returned by datasource)
 * Body is structured content, not a raw string
 */
export const productWithDataSchema: ReturnType<
  typeof productSchema.extend<{
    frontmatter: ProductFrontmatterSchema;
    body: ProductBodySchema;
    labels: z.ZodRecord<z.ZodString, z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
  }>
> = productSchema.extend({
  frontmatter: productFrontmatterParserSchema,
  body: productBodySchema,
  labels: z.record(z.string(), z.string()),
  ogImageUrl: z.string().optional(), // Absolute URL for social preview metadata
});

export type ProductWithData = z.output<typeof productWithDataSchema>;

/**
 * Enriched product (after site-builder enrichment adds url/typeLabel)
 * Schema validates with optional fields — site-builder enriches before rendering
 */
export const enrichedProductSchema: ReturnType<
  typeof productWithDataSchema.extend<{
    url: z.ZodOptional<z.ZodString>;
    typeLabel: z.ZodOptional<z.ZodString>;
    listUrl: z.ZodOptional<z.ZodString>;
    listLabel: z.ZodOptional<z.ZodString>;
    ogImageUrl: z.ZodOptional<z.ZodString>;
  }>
> = productWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  ogImageUrl: z.string().optional(),
});

export type EnrichedProduct = z.output<typeof enrichedProductSchema>;
