import type {
  Plugin,
  EntityPluginContext,
  Template,
  DataSource,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/templates";
import {
  enrichedProductSchema,
  productSchema,
  type Product,
} from "./schemas/product";
import { productAdapter } from "./adapters/product-adapter";
import { overviewSchema, overviewWithDataSchema } from "./schemas/overview";
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
import { createProductPrintableProvider } from "./attachments/printable-provider";
import { PRODUCT_PRINTABLE_ATTACHMENT_TYPE } from "./attachments/printable-template";
import { createProductOgImageProvider } from "./attachments/og-image-provider";
import { PRODUCT_OG_IMAGE_ATTACHMENT_TYPE } from "./attachments/og-image-template";
import packageJson from "../package.json";

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
      createProductPrintableProvider(context),
    );
    this.unregisterOgImageAttachmentProvider = context.attachments.register(
      "product",
      PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
      createProductOgImageProvider(context),
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
