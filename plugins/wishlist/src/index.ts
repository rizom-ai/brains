import type { Plugin, ServicePluginContext, PluginTool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import {
  wishlistConfigSchema,
  wishSchema,
  type WishlistConfig,
  type WishEntity,
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

    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send("dashboard:register-widget", {
        id: "top-wishes",
        pluginId: this.id,
        title: "Top Wishes",
        section: "secondary",
        priority: 30,
        rendererName: "ListWidget",
        dataProvider: async () => {
          const wishes = await context.entityService.listEntities<WishEntity>(
            "wish",
            {
              limit: 10,
            },
          );

          const priorityOrder: Record<string, number> = {
            critical: 0,
            high: 1,
            medium: 2,
            low: 3,
          };
          wishes.sort((a, b) => {
            const reqDiff = b.metadata.requested - a.metadata.requested;
            if (reqDiff !== 0) return reqDiff;
            return (
              (priorityOrder[a.metadata.priority] ?? 2) -
              (priorityOrder[b.metadata.priority] ?? 2)
            );
          });

          return {
            items: wishes.map((w) => ({
              id: w.id,
              name: `${w.metadata.title} (×${w.metadata.requested})`,
              type: w.metadata.priority,
            })),
          };
        },
      });
      return { success: true };
    });

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
      "In your response, tell the user their request has been added to the wishlist."
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
