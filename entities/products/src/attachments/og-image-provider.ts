import {
  createOgImageProvider,
  preferredSlug,
  type OgImageProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/sdk/entities";
import type { Product } from "../schemas/product";
import { productFrontmatterSchema } from "../schemas/product";
import {
  PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
  productOgImageTemplate,
  type ProductOgImageTemplateData,
} from "./og-image-template";

export const createProductOgImageProvider: OgImageProviderFactory =
  createOgImageProvider<Product, ProductOgImageTemplateData>({
    sourceEntityType: "product",
    attachmentType: PRODUCT_OG_IMAGE_ATTACHMENT_TYPE,
    template: productOgImageTemplate,
    themeMode: "light",
    buildContent: (product, helpers) => {
      const { frontmatter, content: body } = parseMarkdown(product.content);
      const parsed = productFrontmatterSchema.parse(frontmatter);
      const tagline = extractSection(body, "Tagline");

      return {
        name: parsed.name,
        availability: parsed.availability,
        ...(tagline ? { tagline } : {}),
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.name,
    slug: (product) =>
      preferredSlug(product.metadata.slug, product.metadata.name),
  });

function extractSection(content: string, heading: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start === -1) return undefined;

  const sectionLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("## ")) break;
    sectionLines.push(line);
  }

  const value = sectionLines.join("\n").trim();
  return value.length > 0 ? value : undefined;
}
