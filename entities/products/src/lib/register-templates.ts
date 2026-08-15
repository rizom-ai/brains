import { createTemplate, z, type Template } from "@brains/sdk/entities";
import {
  ProductsPageTemplate,
  type ProductsPageProps,
} from "../templates/products-page";
import {
  ProductDetailTemplate,
  type ProductDetailProps,
} from "../templates/product-detail";
import type {
  OverviewView,
  ProductSchemaData,
} from "../templates/product-view";

const contentVisibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: z.record(z.string(), z.unknown()),
  contentHash: z.string(),
});

const productAvailabilitySchema = z.enum([
  "available",
  "early access",
  "coming soon",
  "planned",
]);

const productFeatureSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const productFrontmatterViewSchema = z.object({
  name: z.string(),
  availability: productAvailabilitySchema,
  order: z.number(),
  ogImageId: z.string().nullable().default(null),
});

const productBodyViewSchema = z.object({
  tagline: z.string(),
  promise: z.string(),
  role: z.string(),
  purpose: z.string(),
  audience: z.string(),
  values: z.array(z.string()).min(1),
  features: z.array(productFeatureSchema).min(1).max(6),
  story: z.string(),
});

const productMetadataViewSchema = z.object({
  name: z.string(),
  availability: productAvailabilitySchema,
  order: z.number(),
  ogImageId: z.string().nullable().default(null),
  slug: z.string(),
});

const enrichedProductSchema: z.ZodType<ProductSchemaData> =
  baseEntitySchema.extend({
    entityType: z.literal("product"),
    metadata: productMetadataViewSchema,
    frontmatter: productFrontmatterViewSchema,
    body: productBodyViewSchema,
    labels: z.record(z.string(), z.string()),
    url: z.string().nullable().default(null),
    typeLabel: z.string().nullable().default(null),
    listUrl: z.string().nullable().default(null),
    listLabel: z.string().nullable().default(null),
    ogImageUrl: z.string().nullable().default(null),
  });

const labeledTextSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const ctaSchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  link: z.string(),
});

const overviewFrontmatterViewSchema = z.object({
  headline: z.string(),
  tagline: z.string(),
});

const overviewBodyViewSchema = z.object({
  vision: z.string(),
  pillars: z.array(labeledTextSchema).min(1).max(6),
  approach: z.array(labeledTextSchema).min(1).max(6),
  productsIntro: z.string(),
  technologies: z.array(labeledTextSchema).min(1).max(6),
  benefits: z.array(labeledTextSchema).min(1).max(6),
  cta: ctaSchema,
});

const overviewMetadataViewSchema = z.object({
  headline: z.string(),
  slug: z.string(),
});

const overviewWithDataSchema: z.ZodType<OverviewView> = baseEntitySchema.extend(
  {
    entityType: z.literal("products-overview"),
    metadata: overviewMetadataViewSchema,
    frontmatter: overviewFrontmatterViewSchema,
    body: overviewBodyViewSchema,
    labels: z.record(z.string(), z.string()),
  },
);

const productsPageSchema = z.object({
  overview: overviewWithDataSchema,
  products: z.array(enrichedProductSchema),
});

const productDetailSchema = z.object({
  product: enrichedProductSchema,
});

export function getTemplates(): Record<string, Template> {
  return {
    "product-list": createTemplate<
      z.output<typeof productsPageSchema>,
      ProductsPageProps
    >({
      name: "product-list",
      description: "Products page — overview + brain model cards",
      schema: productsPageSchema,
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: { component: ProductsPageTemplate },
    }),
    "product-detail": createTemplate<
      z.output<typeof productDetailSchema>,
      ProductDetailProps
    >({
      name: "product-detail",
      description: "Individual product detail page",
      schema: productDetailSchema,
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: { component: ProductDetailTemplate },
    }),
  };
}
