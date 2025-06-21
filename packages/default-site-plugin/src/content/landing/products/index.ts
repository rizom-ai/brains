import type { ContentTemplate } from "@brains/types";
import { productsSectionSchema, type ProductsSection } from "./schema";

export const productsSectionTemplate: ContentTemplate<ProductsSection> = {
  name: "products-section",
  description: "Products and projects showcase section",
  schema: productsSectionSchema,
  basePrompt: `Generate a products section showcasing the organization's key offerings.

Context will be provided about:
- Organization name and mission
- Core values
- Focus areas
- Target audience

Based on this context and available content, create:
- A section label (e.g., "Our Products", "What We Build", "Our Ecosystem")
- A compelling headline that showcases the products
- A brief description of the product portfolio
- 3-6 products with:
  - Unique memorable names
  - Clear taglines that explain value
  - Concise descriptions (1-2 sentences)
  - Appropriate development status
  - Relevant icon names (use simple identifiers like "brain", "network", "tools")
  - Optional links if mentioned in content

Ensure products align with the organization's mission and values.
Make them concrete and understandable to the target audience.`,
};

export { productsSectionSchema } from "./schema";
export type { Product, ProductsSection } from "./schema";
