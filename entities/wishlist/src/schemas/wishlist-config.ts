import { z } from "@brains/utils/zod";

export type WishlistConfig = Record<string, never>;
export type WishlistConfigInput = Record<string, unknown>;

/**
 * Wishlist plugin configuration schema
 */
export const wishlistConfigSchema: z.ZodType<
  WishlistConfig,
  WishlistConfigInput
> = z
  .object({})
  .catchall(z.unknown())
  .transform((): WishlistConfig => ({}));
