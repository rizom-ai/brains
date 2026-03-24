import type { Plugin, EntityPluginContext } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import {
  wishlistConfigSchema,
  wishSchema,
  type WishlistConfig,
  type WishEntity,
} from "./schemas/wish";
import { wishAdapter } from "./adapters/wish-adapter";
import { WishCreateHandler } from "./handlers/wish-create-handler";
import { sortWishesByDemand } from "./lib/sort-wishes";
import packageJson from "../package.json";

export class WishlistPlugin extends EntityPlugin<WishEntity, WishlistConfig> {
  readonly entityType = wishAdapter.entityType;
  readonly schema = wishSchema;
  readonly adapter = wishAdapter;

  constructor(config: Partial<WishlistConfig> = {}) {
    super("wishlist", packageJson, config, wishlistConfigSchema);
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Dashboard widget
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
            { limit: 10 },
          );
          sortWishesByDemand(wishes);
          return {
            items: wishes.map((w) => ({
              id: w.id,
              name: w.metadata.title,
              count: w.metadata.requested,
              priority: w.metadata.priority,
              status: w.metadata.status,
            })),
          };
        },
      });
      return { success: true };
    });

    // Custom create handler with semantic dedup
    const handler = new WishCreateHandler(this.logger, context);
    context.jobs.registerHandler("wish:create", {
      process: handler.process.bind(handler),
      validateAndParse: (data: unknown) => data,
    });
  }

  protected override async getInstructions(): Promise<string> {
    return (
      "**CRITICAL — Unfulfilled requests**: ALWAYS call `system_create` with entityType " +
      '"wish" BEFORE responding when you cannot fulfill a user\'s request. This applies to ' +
      "ALL unfulfillable requests: physical actions, missing integrations, and any capability " +
      "you lack. Do NOT just explain you can't do it — create the wish first, THEN respond. " +
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
