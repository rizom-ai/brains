export { ProductsLayout } from "./layout";
export { productsSectionSchema, type ProductsSection } from "./schema";
export { ProductsSectionFormatter } from "./formatter";

import { productsSectionSchema } from "./schema";
import { ProductsLayout } from "./layout";
import { ProductsSectionFormatter } from "./formatter";
import productsPrompt from "./prompt.txt";

export const productsTemplate = {
  name: "products",
  description: "Products section with status badges",
  schema: productsSectionSchema,
  component: ProductsLayout,
  formatter: new ProductsSectionFormatter(),
  prompt: productsPrompt,
  interactive: false,
};