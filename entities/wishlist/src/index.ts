import type {
  Plugin,
  EntityPluginContext,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
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
          section: "secondary",
          priority: 30,
          rendererName: "ListWidget",
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
    return (
      "**CRITICAL — Wishlist exclusions**: A2A agent-contact requests are never wishlist cases. " +
      "If a request asks you to ask, message, contact, call, or reach out to an agent, and the target is missing, ambiguous, archived, URL-only, unsaved-domain, or not-yet-saved in the local agent directory, do not call any create tool for a wish. Tell the user to add/save or clarify the agent first. " +
      'This includes requests that contain a full agent URL, a bare domain like unknown-agent.io, or phrasing like "message this agent URL for me". Only create or save an agent entry if the user explicitly asks you to add or save that agent. ' +
      "**CRITICAL — Unfulfilled requests**: For other unfulfillable requests, ALWAYS call `system_create` with entityType " +
      '"wish" BEFORE responding when you cannot fulfill a user\'s request. This applies to ' +
      "physical actions, non-agent missing integrations, and any non-agent capability " +
      "you lack. Physical-world requests like making food, driving somewhere, or doing chores are always wishlist cases. Do NOT just explain you can't do it — create the wish first, THEN respond. " +
      "Never claim the request was added to the wishlist unless you actually called system_create for the wish. In your response, tell the user their request has been added to the wishlist."
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
