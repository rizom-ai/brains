import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  productSchema,
  productFrontmatterSchema,
  type Product,
  type ProductMetadata,
} from "../schemas/product";

/**
 * Entity adapter for product entities
 * Frontmatter holds only identity + metadata (name, availability, order).
 * Descriptive content (tagline, role, purpose, audience, values, features, story)
 * lives in the structured body — parsed by ProductBodyFormatter in the datasource.
 */
export class ProductAdapter extends BaseEntityAdapter<
  Product,
  ProductMetadata
> {
  constructor() {
    super({
      entityType: "product",
      schema: productSchema,
      frontmatterSchema: productFrontmatterSchema,
    });
  }

  public toMarkdown(entity: Product): string {
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

export const productAdapter = new ProductAdapter();
