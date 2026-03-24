import type {
  Plugin,
  EntityPluginContext,
  Template,
  DataSource,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import {
  productSchema,
  enrichedProductSchema,
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
import packageJson from "../package.json";

const productsPageSchema = z.object({
  overview: overviewWithDataSchema,
  products: z.array(enrichedProductSchema),
});

const productDetailSchema = z.object({
  product: enrichedProductSchema,
});

export class ProductsPlugin extends EntityPlugin<Product, ProductsConfig> {
  readonly entityType = productAdapter.entityType;
  readonly schema = productSchema;
  readonly adapter = productAdapter;

  constructor(config: ProductsConfigInput = {}) {
    super("products", packageJson, config, productsConfigSchema);
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "product-list": createTemplate<
        z.infer<typeof productsPageSchema>,
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
        z.infer<typeof productDetailSchema>,
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
    // Second entity type: products-overview (singleton)
    context.entities.register(
      "products-overview",
      overviewSchema,
      overviewAdapter,
    );
  }
}

export function productsPlugin(config: ProductsConfigInput = {}): Plugin {
  return new ProductsPlugin(config);
}
