import { z } from "@brains/utils/zod-v4";

/**
 * Wishlist plugin configuration schema
 */
export const wishlistConfigSchema = z
  .object({})
  .catchall(z.unknown())
  .transform(() => ({}));

export type WishlistConfig = z.output<typeof wishlistConfigSchema>;
export type WishlistConfigInput = z.input<typeof wishlistConfigSchema>;
