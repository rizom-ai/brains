import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z, slugify } from "@brains/utils";
import {
  productSchema,
  productFrontmatterSchema,
  type Product,
  type ProductMetadata,
} from "../schemas/product";

/**
 * Entity adapter for product entities
 * Frontmatter holds only identity + metadata (name, status, order).
 * Descriptive content (tagline, role, purpose, audience, values, features, story)
 * lives in the structured body — parsed by ProductBodyFormatter in the datasource.
 */
export class ProductAdapter implements EntityAdapter<Product, ProductMetadata> {
  public readonly entityType = "product" as const;
  public readonly schema = productSchema;

  public toMarkdown(entity: Product): string {
    let contentBody = entity.content;
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    try {
      const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
        entity.content,
        productFrontmatterSchema,
      );

      return generateMarkdownWithFrontmatter(contentBody, frontmatter);
    } catch {
      return contentBody;
    }
  }

  public fromMarkdown(markdown: string): Partial<Product> {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
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
        status: frontmatter.status,
        order: frontmatter.order,
      },
    };
  }

  public extractMetadata(entity: Product): ProductMetadata {
    return entity.metadata;
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: Product): string {
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        productFrontmatterSchema,
      );
      return generateFrontmatter(metadata);
    } catch {
      return "";
    }
  }
}

export const productAdapter = new ProductAdapter();
