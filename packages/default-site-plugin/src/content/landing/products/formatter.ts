import type { ContentFormatter } from "@brains/types";
import type { ProductsSection } from "./schema";

export class ProductsSectionFormatter
  implements ContentFormatter<ProductsSection>
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

  parse(_content: string): ProductsSection {
    // For now, throw an error as parsing markdown back to structured data
    // would require complex parsing logic
    throw new Error(
      "Parsing products section from markdown not yet implemented",
    );
  }
}
