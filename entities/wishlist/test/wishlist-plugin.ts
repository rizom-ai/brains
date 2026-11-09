import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import wishlistPackage, { type WishlistConfigInput } from "../src";

export type WishlistEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the wishlist installs, as the canonical brain composes it. */
export function wishlistPlugin(
  config: WishlistConfigInput = {},
): WishlistEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    wishlistPackage,
    config,
    { name: "@brains/wishlist", version: "0.0.0-test" },
    // Under the id its class had, with every name derived from it.
    { pluginId: "wishlist" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The wishlist installs no entity plugin");
  }
  return plugin;
}
