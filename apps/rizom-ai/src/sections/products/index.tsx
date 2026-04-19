import { createTemplate } from "@brains/templates";
import { ProductsContentSchema, type ProductsContent } from "./schema";
import { ProductsLayout } from "./layout";
import { productsFormatter } from "./formatter";

export const productsTemplate = createTemplate<ProductsContent>({
  name: "products",
  description: "Rizom products section — array of product cards",
  schema: ProductsContentSchema,
  formatter: productsFormatter,
  requiredPermission: "public",
  layout: { component: ProductsLayout },
});
