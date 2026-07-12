import { z } from "@brains/utils/zod";

export interface ProductsConfig {
  route: string;
}

export interface ProductsConfigInput {
  route?: string | undefined;
}

export const productsConfigSchema: z.ZodType<
  ProductsConfig,
  ProductsConfigInput
> = z.object({
  route: z.string().default("/products"),
});
