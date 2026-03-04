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

  protected override async getInstructions(): Promise<string> {
    return (
      "**CRITICAL — Unfulfilled requests**: ALWAYS call `wishlist_add` BEFORE responding " +
      "when you cannot fulfill a user's request. This applies to ALL unfulfillable requests: " +
      'physical actions ("water my plants", "clean my house"), missing integrations ' +
      '("send an email", "post to Instagram"), and any capability you lack. ' +
      "Do NOT just explain you can't do it — call `wishlist_add` first, THEN respond. " +
      "Every unfulfilled request is valuable product feedback that must be tracked."
    );
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
