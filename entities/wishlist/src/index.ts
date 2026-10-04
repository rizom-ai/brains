/**
 * Wishlist package.
 *
 * One entity: a wish, recording a capability the brain was asked for and
 * could not perform. Configured deduplication stays with the entity.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { wish, wishCreateRoutes } from "./wish-entity";
import { wishlistConfigSchema } from "./schemas/wishlist-config";
import { wishlistEvalHandlers } from "./lib/eval-handlers";

const wishlistPackage: EntityPackageDefinition<
  readonly [typeof wish],
  readonly [],
  typeof wishlistConfigSchema
> = defineEntityPackage({
  id: "wishlist",
  config: wishlistConfigSchema,
  entities: [wish],
  configure: ({ config }) => [
    {
      entity: wish,
      create: wishCreateRoutes(config.sameWishDistance),
      evals: wishlistEvalHandlers(config.sameWishDistance),
    },
  ],
});

export default wishlistPackage;

export { wish } from "./wish-entity";
export {
  wishlistConfigSchema,
  type WishlistConfig,
  type WishlistConfigInput,
} from "./schemas/wishlist-config";
export { topWishesWidget } from "./widgets/top-wishes";
export { WISHLIST_INSTRUCTIONS } from "./instructions";

export type {
  WishEntity,
  WishFrontmatter,
  WishMetadata,
  WishStatus,
  WishPriority,
} from "./schemas/wish";
export {
  wishSchema,
  wishFrontmatterSchema,
  wishMetadataSchema,
  wishStatusSchema,
  wishPrioritySchema,
} from "./schemas/wish";
