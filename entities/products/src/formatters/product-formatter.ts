import { StructuredContentFormatter } from "@brains/utils";
import { productBodySchema, type ProductBody } from "../schemas/product";

/**
 * Formatter for the product body content.
 * Converts between structured ProductBody data and markdown sections.
 *
 * Product bodies use structured content (## headings) for descriptive fields
 * (tagline, role, purpose, audience, values, features) plus a free-form story.
 * Only identity + metadata (name, availability, order) stays in frontmatter.
 */
export class ProductBodyFormatter extends StructuredContentFormatter<ProductBody> {
  constructor() {
    super(productBodySchema, {
      title: "Product",
      mappings: [
        { key: "tagline", label: "Tagline", type: "string" },
        { key: "promise", label: "Promise", type: "string" },
        { key: "role", label: "Role", type: "string" },
        { key: "purpose", label: "Purpose", type: "string" },
        { key: "audience", label: "Audience", type: "string" },
        {
          key: "values",
          label: "Values",
          type: "array",
          itemType: "string",
        },
        {
          key: "features",
          label: "Capabilities",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "title", label: "Title", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
        { key: "story", label: "Story", type: "string" },
      ],
    });
  }
}
