import type {
  Plugin,
  EntityPluginContext,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { wishSchema, type WishEntity } from "./schemas/wish";
import {
  wishlistConfigSchema,
  type WishlistConfig,
  type WishlistConfigInput,
} from "./schemas/wishlist-config";
import { WishAdapter, wishAdapter } from "./adapters/wish-adapter";
import { WishCreateHandler } from "./handlers/wish-create-handler";
import { sortWishesByDemand } from "./lib/sort-wishes";
import packageJson from "../package.json";

const wishEntityType = "wish";

export class WishlistPlugin extends EntityPlugin<
  WishEntity,
  WishlistConfig,
  WishlistConfigInput
> {
  readonly entityType: typeof wishEntityType = wishEntityType;
  readonly schema: typeof wishSchema = wishSchema;
  readonly adapter: WishAdapter = wishAdapter;

  constructor(config: WishlistConfigInput = {}) {
    super("wishlist", packageJson, config, wishlistConfigSchema);
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    const result = await new WishCreateHandler(this.logger, context).process(
      {
        ...(input.title ? { title: input.title } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(input.content ? { content: input.content } : {}),
      },
      `wish-create-${Date.now()}`,
      {} as never,
    );

    if (!result.success) {
      return {
        kind: "handled",
        result: {
          success: false,
          error: result.error ?? "Failed to create wish",
        },
      };
    }

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          ...(result.entityId ? { entityId: result.entityId } : {}),
          status: result.existed ? "updated" : "created",
        },
      },
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Dashboard widget
    context.messaging.subscribe("system:plugins:ready", async () => {
      await context.messaging.send({
        type: "dashboard:register-widget",
        payload: {
          id: "top-wishes",
          pluginId: this.id,
          title: "Top Wishes",
          group: "knowledge",
          section: "secondary",
          priority: 30,
          rendererName: "ListWidget",
          digest: [
            { label: "Demand", value: "Top wishes" },
            { label: "Signal", value: "Requested capabilities" },
          ],
          dataProvider: async () => {
            const wishes = await context.entityService.listEntities<WishEntity>(
              {
                entityType: "wish",
                options: { limit: 10 },
              },
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
    return "Wish entities record explicitly requested capabilities or desired end states whose literal completion is outside the available toolset. They may capture outcomes the assistant can advise about but cannot directly perform. They track demand, priority, and status for future capability planning; they are not a substitute for first-class entities that already support the requested action. To show the whole wishlist, call system_list once with entityType wish and omit status; only include status when the user asks for a specific wish status.";
  }
}

export function createWishlistPlugin(config: WishlistConfigInput = {}): Plugin {
  return new WishlistPlugin(config);
}

export const wishlistPlugin: typeof createWishlistPlugin = createWishlistPlugin;

export type {
  WishEntity,
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
  wishSchema,
  wishFrontmatterSchema,
  wishMetadataSchema,
  wishStatusSchema,
  wishPrioritySchema,
} from "./schemas/wish";
export { wishlistConfigSchema } from "./schemas/wishlist-config";
export { WishAdapter };
