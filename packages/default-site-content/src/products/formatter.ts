import { StructuredContentFormatter } from "@brains/structured-content";
import { productsSectionSchema, type ProductsSection } from "./schema";

export class ProductsSectionFormatter extends StructuredContentFormatter<ProductsSection> {
  constructor() {
    super(productsSectionSchema, {
      title: "Products Section",
      mappings: [
        { key: "label", label: "Label", type: "string" },
        { key: "headline", label: "Headline", type: "string" },
        { key: "description", label: "Description", type: "string" },
        {
          key: "products",
          label: "Products",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "id", label: "ID", type: "string" },
            { key: "name", label: "Name", type: "string" },
            { key: "tagline", label: "Tagline", type: "string" },
            { key: "description", label: "Description", type: "string" },
            { key: "status", label: "Status", type: "string" },
            { key: "link", label: "Link", type: "string" },
            { key: "icon", label: "Icon", type: "string" },
          ],
        },
      ],
    });
  }
}
