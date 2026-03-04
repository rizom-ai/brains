import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import {
  wishlistConfigSchema,
  wishSchema,
  type WishlistConfig,
} from "./schemas/wish";
import { WishAdapter } from "./adapters/wish-adapter";
import { createWishlistTools } from "./tools/index";
import packageJson from "../package.json";

/**
 * Wishlist plugin for tracking unfulfilled user requests.
 *
 * When the agent can't fulfill a request because the capability doesn't exist,
 * it logs a wish. Repeated requests increment the request count. The wishlist
 * forms a living roadmap of what users want.
 */
export class WishlistPlugin extends ServicePlugin<WishlistConfig> {
  constructor(config: Partial<WishlistConfig> = {}) {
    super("wishlist", packageJson, config, wishlistConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.register("wish", wishSchema, new WishAdapter());
    this.logger.debug("Wishlist plugin registered");
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return createWishlistTools(this.id, this.getContext());
  }
}

export function createWishlistPlugin(
  config: Partial<WishlistConfig> = {},
): Plugin {
  return new WishlistPlugin(config);
}

export const wishlistPlugin = createWishlistPlugin;

export type {
  WishlistConfig,
  WishEntity,
  WishFrontmatter,
  WishMetadata,
  WishStatus,
  WishPriority,
} from "./schemas/wish";
export {
  wishlistConfigSchema,
  wishSchema,
  wishFrontmatterSchema,
  wishMetadataSchema,
  wishStatusSchema,
  wishPrioritySchema,
} from "./schemas/wish";
export { WishAdapter } from "./adapters/wish-adapter";
