import type { SchemaFormatter } from "@brains/types";
import { productsSectionSchema, type ProductsSection } from "./schema";

export class ProductsSectionFormatter
  implements SchemaFormatter<ProductsSection>
{
  format(data: ProductsSection): string {
    let output = `## ${data.headline}\n\n`;
    output += `${data.description}\n\n`;

    for (const product of data.products) {
      output += `### ${product.name}\n`;
      output += `*${product.tagline}*\n\n`;
      output += `${product.description}\n\n`;
      output += `**Status:** ${product.status}\n`;
      if (product.link) {
        output += `**Link:** [View →](${product.link})\n`;
      }
      output += `\n`;
    }

    return output;
  }

  canFormat(data: unknown): boolean {
    const result = productsSectionSchema.safeParse(data);
    return result.success;
  }
}
