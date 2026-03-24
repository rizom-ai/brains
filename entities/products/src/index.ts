export { ProductsPlugin, productsPlugin } from "./plugin";
export { productsConfigSchema, type ProductsConfig } from "./config";
export {
  productSchema,
  productWithDataSchema,
  enrichedProductSchema,
  productFrontmatterSchema,
  productBodySchema,
  productFeatureSchema,
  productAvailabilitySchema,
  type Product,
  type ProductWithData,
  type EnrichedProduct,
  type ProductFrontmatter,
  type ProductBody,
  type ProductFeature,
  type ProductAvailability,
} from "./schemas/product";
export { ProductBodyFormatter } from "./formatters/product-formatter";
export { productAdapter, ProductAdapter } from "./adapters/product-adapter";
export {
  overviewSchema,
  overviewWithDataSchema,
  overviewFrontmatterSchema,
  overviewBodySchema,
  overviewMetadataSchema,
  pillarSchema,
  benefitSchema,
  ctaSchema,
  type Overview,
  type OverviewWithData,
  type OverviewFrontmatter,
  type OverviewBody,
  type OverviewMetadata,
  type Pillar,
  type Benefit,
  type CTA,
} from "./schemas/overview";
export { OverviewBodyFormatter } from "./formatters/overview-formatter";
export { overviewAdapter, OverviewAdapter } from "./adapters/overview-adapter";
export { ProductsDataSource } from "./datasources/products-datasource";
