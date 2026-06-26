import { z } from "@brains/utils/zod-v4";

export const productsConfigSchema = z.object({
  route: z.string().default("/products"),
});

export type ProductsConfig = z.output<typeof productsConfigSchema>;
export type ProductsConfigInput = z.input<typeof productsConfigSchema>;
