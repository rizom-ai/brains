import type {
  Plugin,
  EntityPluginContext,
  Template,
  DataSource,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/templates";
import { productSchema, type Product } from "./schemas/product";
import { productAdapter } from "./adapters/product-adapter";
import { overviewSchema } from "./schemas/overview";
import { overviewAdapter } from "./adapters/overview-adapter";
import { ProductsDataSource } from "./datasources/products-datasource";
import {
  ProductsPageTemplate,
  type ProductsPageProps,
} from "./templates/products-page";
import {
  ProductDetailTemplate,
  type ProductDetailProps,
} from "./templates/product-detail";
import type { ProductsConfig, ProductsConfigInput } from "./config";
import { productsConfigSchema } from "./config";
import { ProductPrintableAttachmentProvider } from "./attachments/printable-provider";
import { PRODUCT_PRINTABLE_ATTACHMENT_TYPE } from "./attachments/printable-template";
import { ProductOgImageAttachmentProvider } from "./attachments/og-image-provider";
import { PRODUCT_OG_IMAGE_ATTACHMENT_TYPE } from "./attachments/og-image-template";
import packageJson from "../package.json";

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
  ogImageId: z.string().optional(),
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
  slug: z.string(),
});

const enrichedProductSchema = baseEntitySchema.extend({
  entityType: z.literal("product"),
  metadata: productMetadataViewSchema,
  frontmatter: productFrontmatterViewSchema,
  body: productBodyViewSchema,
  labels: z.record(z.string(), z.string()),
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  ogImageUrl: z.string().optional(),
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

const overviewWithDataSchema = baseEntitySchema.extend({
  entityType: z.literal("products-overview"),
  metadata: overviewMetadataViewSchema,
  frontmatter: overviewFrontmatterViewSchema,
  body: overviewBodyViewSchema,
  labels: z.record(z.string(), z.string()),
});

const productsPageSchema = z.object({
  overview: overviewWithDataSchema,
  products: z.array(enrichedProductSchema),
});

const productDetailSchema = z.object({
  product: enrichedProductSchema,
});

export class ProductsPlugin extends EntityPlugin<
  Product,
  ProductsConfig,
  ProductsConfigInput
> {
  readonly entityType: typeof productAdapter.entityType =
    productAdapter.entityType;
  readonly schema: typeof productSchema = productSchema;
  readonly adapter: typeof productAdapter = productAdapter;
  private unregisterPrintableAttachmentProvider: (() => void) | undefined;
  private unregisterOgImageAttachmentProvider: (() => void) | undefined;

  constructor(config: ProductsConfigInput = {}) {
    super("products", packageJson, config, productsConfigSchema);
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "product-list": createTemplate<
        z.output<typeof productsPageSchema>,
        ProductsPageProps
      >({
        name: "product-list",
        description: "Products page — overview + brain model cards",
        schema: productsPageSchema,
        dataSourceId: "products:entities",
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
        dataSourceId: "products:entities",
        requiredPermission: "public",
        layout: { component: ProductDetailTemplate },
      }),
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new ProductsDataSource(this.logger.child("ProductsDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    this.unregisterPrintableAttachmentProvider = context.attachments.register(
      "product",
      PRODUCT_PRINTABLE_ATTACHMENT_TYPE,
      new ProductPrintableAttachmentProvider(context),
    );
    this.unregisterOgImageAttachmentProvider = context.attachments.register(
      "product",
      PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
      new ProductOgImageAttachmentProvider(context),
    );

    // Second entity type: products-overview (singleton)
    context.entities.register(
      "products-overview",
      overviewSchema,
      overviewAdapter,
    );
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterPrintableAttachmentProvider?.();
    this.unregisterPrintableAttachmentProvider = undefined;
    this.unregisterOgImageAttachmentProvider?.();
    this.unregisterOgImageAttachmentProvider = undefined;
  }
}

export function productsPlugin(config: ProductsConfigInput = {}): Plugin {
  return new ProductsPlugin(config);
}
