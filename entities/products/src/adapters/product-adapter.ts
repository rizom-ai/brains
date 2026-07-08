import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import {
  productSchema,
  productFrontmatterSchema,
  type Product,
  type ProductMetadata,
  type ProductFrontmatter,
} from "../schemas/product";
import { ProductBodyFormatter } from "../formatters/product-formatter";

/**
 * Entity adapter for product entities
 * Frontmatter holds only identity + metadata (name, availability, order).
 * Descriptive content (tagline, role, purpose, audience, values, features, story)
 * lives in the structured body — parsed by ProductBodyFormatter in the datasource.
 */
export class ProductAdapter extends BaseEntityAdapter<
  Product,
  ProductMetadata,
  ProductFrontmatter
> {
  constructor() {
    super({
      entityType: "product",
      purpose: "A product entry in the portfolio.",
      schema: productSchema,
      frontmatterSchema: productFrontmatterSchema,
      bodyFormatter: new ProductBodyFormatter(),
    });
  }

  public override toMarkdown(entity: Product): string {
    const body = this.extractBody(entity.content);
    try {
      const frontmatter = this.parseFrontMatter(
        entity.content,
        productFrontmatterSchema,
      );
      return this.buildMarkdown(body, frontmatter);
    } catch {
      return body;
    }
  }

  public fromMarkdown(markdown: string): Partial<Product> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      productFrontmatterSchema,
    );
    const slug = slugify(frontmatter.name);

    return {
      content: markdown,
      entityType: "product",
      metadata: {
        name: frontmatter.name,
        slug,
        availability: frontmatter.availability,
        order: frontmatter.order,
      },
    };
  }
}

export const productAdapter: ProductAdapter = new ProductAdapter();
