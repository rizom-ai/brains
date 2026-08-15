/**
 * Products entity package.
 *
 * Two entities: `product` entries and the `products-overview` singleton
 * that heads the products page. Both keep identity in frontmatter and
 * descriptive content in a structured body, parsed by the body formatters.
 *
 * Authored against the public declarative surface (`@brains/sdk/entities`).
 */

import {
  defineEntity,
  defineEntityPackage,
  slugify,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  productFrontmatterSchema,
  productMetadataSchema,
} from "./schemas/product";
import {
  overviewFrontmatterSchema,
  overviewMetadataSchema,
} from "./schemas/overview";
import { productsDataSource } from "./datasources/products-datasource";
import { getTemplates } from "./lib/register-templates";
import { createProductPrintableProvider } from "./attachments/printable-provider";
import { PRODUCT_PRINTABLE_ATTACHMENT_TYPE } from "./attachments/printable-template";
import { createProductOgImageProvider } from "./attachments/og-image-provider";
import { PRODUCT_OG_IMAGE_ATTACHMENT_TYPE } from "./attachments/og-image-template";

export const product: EntityDefinition<
  "product",
  typeof productMetadataSchema
> = defineEntity({
  type: "product",
  purpose: "A product entry in the portfolio.",
  metadata: productMetadataSchema,
  markdown: {
    decode: ({ content, frontmatter }) => {
      const parsed = productFrontmatterSchema.parse(frontmatter);
      return {
        content,
        metadata: {
          name: parsed.name,
          availability: parsed.availability,
          order: parsed.order,
          ...(parsed.ogImageId === undefined
            ? {}
            : { ogImageId: parsed.ogImageId }),
          slug: slugify(parsed.name),
        },
      };
    },
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: {
        name: metadata.name,
        availability: metadata.availability,
        order: metadata.order,
        ...(metadata.ogImageId === undefined
          ? {}
          : { ogImageId: metadata.ogImageId }),
      },
    }),
  },
  templates: getTemplates(),
  dataSources: [productsDataSource],
  attachments: [
    {
      type: PRODUCT_PRINTABLE_ATTACHMENT_TYPE,
      provider: createProductPrintableProvider,
    },
    {
      type: PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
      provider: createProductOgImageProvider,
    },
  ],
});

export const productsOverview: EntityDefinition<
  "products-overview",
  typeof overviewMetadataSchema
> = defineEntity({
  type: "products-overview",
  purpose: "The singleton overview heading the products page.",
  metadata: overviewMetadataSchema,
  markdown: {
    decode: ({ content, frontmatter }) => {
      const parsed = overviewFrontmatterSchema.parse(frontmatter);
      return {
        content,
        metadata: {
          headline: parsed.headline,
          slug: slugify(parsed.headline),
        },
      };
    },
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: { headline: metadata.headline },
    }),
  },
});

export type Product = EntityOf<typeof product>;
export type Overview = EntityOf<typeof productsOverview>;

const productsPackage: EntityPackageDefinition<
  readonly [typeof product, typeof productsOverview],
  readonly []
> = defineEntityPackage({
  id: "products",
  entities: [product, productsOverview],
});

export default productsPackage;

export {
  productSchema,
  productWithDataSchema,
  enrichedProductSchema,
  productFrontmatterSchema,
  productBodySchema,
  productFeatureSchema,
  productAvailabilitySchema,
  productMetadataSchema,
  type ProductWithData,
  type EnrichedProduct,
  type ProductFrontmatter,
  type ProductBody,
  type ProductFeature,
  type ProductAvailability,
} from "./schemas/product";
export { ProductBodyFormatter } from "./formatters/product-formatter";
export {
  overviewSchema,
  overviewWithDataSchema,
  overviewFrontmatterSchema,
  overviewBodySchema,
  overviewMetadataSchema,
  pillarSchema,
  benefitSchema,
  ctaSchema,
  type OverviewWithData,
  type OverviewFrontmatter,
  type OverviewBody,
  type OverviewMetadata,
  type Pillar,
  type Benefit,
  type CTA,
} from "./schemas/overview";
export { OverviewBodyFormatter } from "./formatters/overview-formatter";
export { productsDataSource } from "./datasources/products-datasource";
