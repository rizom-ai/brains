import { z } from "@brains/utils";

export const productsConfigSchema = z.object({
  route: z.string().default("/products"),
});

export type ProductsConfig = z.infer<typeof productsConfigSchema>;
export type ProductsConfigInput = Partial<ProductsConfig>;
