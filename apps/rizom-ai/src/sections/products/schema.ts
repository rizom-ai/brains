import { z } from "@brains/utils";

export const ProductVariantSchema = z.enum(["rover", "relay", "ranger"]);

/**
 * Schema for a single product card. Multiple cards live inside one
 * `products` section as an array (mirrors how problem.cards works).
 */
export const ProductCardSchema = z.object({
  variant: ProductVariantSchema,
  label: z.string(),
  badge: z.string(),
  headline: z.string(),
  description: z.string(),
  tagline: z.array(z.string()).min(1).optional(),
  tags: z.array(z.string()).min(1),
});

export const ProductsContentSchema = z.object({
  cards: z.array(ProductCardSchema).min(1),
});

export type ProductVariant = z.infer<typeof ProductVariantSchema>;
export type ProductCardContent = z.infer<typeof ProductCardSchema>;
export type ProductsContent = z.infer<typeof ProductsContentSchema>;
