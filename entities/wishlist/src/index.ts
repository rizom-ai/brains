/**
 * Wishlist package.
 *
 * One entity: a wish, recording a capability the brain was asked for and
 * could not perform. No configuration, so this is an entity package.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { wish } from "./wish-entity";

const wishlistPackage: EntityPackageDefinition<
  readonly [typeof wish],
  readonly []
> = defineEntityPackage({ id: "wishlist", entities: [wish] });

export default wishlistPackage;

export { wish } from "./wish-entity";
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
