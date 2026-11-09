import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { wishlistEvalHandlers } from "./lib/eval-handlers";
import { wishCreateRoutes } from "./lib/wish-create";
import { wishlistConfigSchema } from "./schemas/wishlist-config";
import { wish } from "./wish";

/**
 * The wishlist: one entity, a wish, recording a capability the brain was
 * asked for and could not perform. Its create routes and its same-wish
 * eval read the configured `sameWishDistance`.
 */
export const wishlistPackage: EntityPackageDefinition<
  readonly [typeof wish],
  readonly [],
  typeof wishlistConfigSchema
> = defineEntityPackage({
  id: "wishlist",
  config: wishlistConfigSchema,
  entities: [wish],
  configure: ({ config }) => ({
    entities: [
      {
        entity: wish,
        create: wishCreateRoutes(config.sameWishDistance),
        evals: wishlistEvalHandlers(config.sameWishDistance),
      },
    ],
  }),
});

export default wishlistPackage;

export { wish } from "./wish";
export { WISHLIST_INSTRUCTIONS } from "./instructions";
export { topWishesWidget } from "./widgets/top-wishes";
export type { Wish } from "./lib/wish-dedup";
export type {
  WishFrontmatter,
  WishMetadata,
  WishStatus,
  WishPriority,
} from "./schemas/wish";
export type {
  WishlistConfig,
  WishlistConfigInput,
} from "./schemas/wishlist-config";
export {
  wishFrontmatterSchema,
  wishMetadataSchema,
  wishStatusSchema,
  wishPrioritySchema,
} from "./schemas/wish";
export { wishlistConfigSchema } from "./schemas/wishlist-config";
