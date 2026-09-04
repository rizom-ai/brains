import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { CallbackProgressReporter } from "@brains/utils/progress";
import {
  wishPrioritySchema,
  wishSchema,
  wishStatusSchema,
  type WishEntity,
} from "./schemas/wish";

const wishWidgetDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      count: z.number().int().nonnegative(),
      priority: wishPrioritySchema,
      status: wishStatusSchema,
    }),
  ),
});

function priorityTone(
  priority: z.output<typeof wishPrioritySchema>,
): "error" | "warn" | "neutral" {
  if (priority === "critical") return "error";
  if (priority === "high") return "warn";
  return "neutral";
}

const topWishesWidget = defineDashboardWidget({
  id: "top-wishes",
  title: "Top Wishes",
  group: "knowledge",
  placement: "secondary",
  priority: 30,
  permission: "public",
  data: wishWidgetDataSchema,
  digest: ({ data }) => {
    const top = data.items[0];
    return {
      items: top
        ? [{ label: "Top wish", value: `${top.name} · ×${top.count}` }]
        : [{ label: "Wishes", value: "none yet" }],
    };
  },
  view: ({ data }) => ({
    blocks: [
      {
        type: "list",
        id: "wishes",
        empty: "No wishes yet.",
        items: data.items.map((wish) => ({
          id: wish.id,
          title: wish.name,
          count: wish.count,
          badges: [
            { label: wish.priority, tone: priorityTone(wish.priority) },
            {
              label: wish.status,
              tone: wish.status === "done" ? "good" : "neutral",
            },
          ],
        })),
      },
    ],
  }),
});
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

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { projectionSource: false, projectionSourceRole: "excluded" };
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    if (input.visibility !== undefined && input.visibility !== "public") {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            "Wish creation currently supports public visibility only; use a note for shared or restricted capture.",
        },
      };
    }

    const result = await new WishCreateHandler(this.logger, context).process(
      {
        ...(input.title ? { title: input.title } : {}),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        ...(input.content ? { content: input.content } : {}),
      },
      `wish-create-${Date.now()}`,
      CallbackProgressReporter.noop(),
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
    context.messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
      await registerBuiltInDashboardWidget({
        context,
        definition: topWishesWidget,
        load: async ({ signal }) => {
          signal.throwIfAborted();
          const wishes = await context.entityService.listEntities(
            {
              entityType: "wish",
              options: { limit: 10 },
            },
            wishSchema,
          );
          signal.throwIfAborted();
          sortWishesByDemand(wishes);
          return {
            items: wishes.map((wish) => ({
              id: wish.id,
              name: wish.metadata.title,
              count: wish.metadata.requested,
              priority: wish.metadata.priority,
              status: wish.metadata.status,
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
    return 'Mandatory unmet-request routing: Wish entities record requested capabilities or desired end states whose literal completion is outside the available toolset. When the user asks for an unavailable product, capability, or real-world outcome no installed tool can perform, explain the limitation and call system_create with entityType "wish" unless the user declines. Availability is determined by the callable tool surface: an installed interface or transport that exposes no tool for the requested action cannot fulfill it. Authorization and ownership boundaries are not missing capabilities: when the current caller permission level, visibility policy, confirmation requirements, or system-maintained record ownership blocks an operation, explain that boundary and MUST NOT call system_create for a wish. A tool withheld from the current caller because of their permission level is also an authorization boundary, not an unmet product request. Do not search durable content to discover executable capabilities or permission workarounds; the callable tool surface and current permission context are authoritative. If you recognize that no callable tool can perform the action and no authorization or ownership boundary applies, do not end the turn after explaining the limitation; in that same turn you MUST call system_create with entityType "wish". The unmet request itself is concrete source material; do not merely decline, offer alternatives, or wait for a separate save verb. Do not invent or look for a dedicated wishlist tool; wishlist entries use the generic entity tools. They track demand, priority, and status for future capability planning; they are not a substitute for first-class entities that already support the requested action. To show the whole wishlist, call system_list once with entityType wish and omit status; only include status when the user asks for a specific wish status.';
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
