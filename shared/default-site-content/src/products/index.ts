export { ProductsLayout } from "./layout";
export { productsSectionSchema, type ProductsSection } from "./schema";
export { ProductsSectionFormatter } from "./formatter";

import { productsSectionSchema, type ProductsSection } from "./schema";
import { ProductsLayout } from "./layout";
import { ProductsSectionFormatter } from "./formatter";
import productsPrompt from "./prompt.txt";
import type { Template } from "@brains/plugins";

export const productsTemplate: Template<ProductsSection> = {
  name: "products",
  description: "Products section with status badges",
  schema: productsSectionSchema,
  basePrompt: productsPrompt,
  requiredPermission: "public",
  formatter: new ProductsSectionFormatter(),
  layout: {
    component: ProductsLayout,
    interactive: false,
  },
};
