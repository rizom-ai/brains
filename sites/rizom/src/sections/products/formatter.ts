import { StructuredContentFormatter } from "@brains/utils";
import { ProductsContentSchema, type ProductsContent } from "./schema";

export const productsFormatter =
  new StructuredContentFormatter<ProductsContent>(ProductsContentSchema, {
    title: "Products Section",
    mappings: [
      {
        key: "cards",
        label: "Cards",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "variant", label: "Variant", type: "string" },
          { key: "canvasId", label: "Canvas Id", type: "string" },
          { key: "label", label: "Label", type: "string" },
          { key: "badge", label: "Badge", type: "string" },
          { key: "headline", label: "Headline", type: "string" },
          { key: "description", label: "Description", type: "string" },
          { key: "tags", label: "Tags", type: "array", itemType: "string" },
        ],
      },
    ],
  });
