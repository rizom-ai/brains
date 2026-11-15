import { instantiatePluginPackageDefinition } from "@brains/plugins";
import wishlistPackage, { type WishlistConfigInput } from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type WishlistEntityPlugin = DeclaredEntityTypePlugin;

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
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The wishlist installs no entity plugin");
  }
  return plugin;
}
