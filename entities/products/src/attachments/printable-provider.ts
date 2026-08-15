import {
  createPrintableProvider,
  preferredSlug,
  type PrintableProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/sdk/entities";
import type { Product } from "../schemas/product";
import { productFrontmatterSchema } from "../schemas/product";
import {
  PRODUCT_PRINTABLE_ATTACHMENT_TYPE,
  productPrintableTemplate,
  type ProductPrintableTemplateData,
} from "./printable-template";

export const createProductPrintableProvider: PrintableProviderFactory =
  createPrintableProvider<Product, ProductPrintableTemplateData>({
    sourceEntityType: "product",
    attachmentType: PRODUCT_PRINTABLE_ATTACHMENT_TYPE,
    template: productPrintableTemplate,
    themeMode: "light",
    buildContent: (product, helpers) => {
      const { frontmatter, content } = parseMarkdown(product.content);
      const parsed = productFrontmatterSchema.parse(frontmatter);

      return {
        name: parsed.name,
        body: content,
        availability: parsed.availability,
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.name,
    slug: (product) =>
      preferredSlug(product.metadata.slug, product.metadata.name),
  });
