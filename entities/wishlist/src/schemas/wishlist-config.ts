import { z } from "@brains/utils/zod";
import { SAME_WISH_DISTANCE } from "../lib/wish-dedup";

export const wishlistConfigSchema: z.ZodObject<{
  sameWishDistance: z.ZodDefault<z.ZodNumber>;
}> = z.object({
  sameWishDistance: z.number().min(0).max(1).default(SAME_WISH_DISTANCE),
});
export type WishlistConfig = z.output<typeof wishlistConfigSchema>;
export type WishlistConfigInput = z.input<typeof wishlistConfigSchema>;
