import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsEntity, formatAsList } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";

/**
 * Input schema for deck:queue tool
 */
export const queueInputSchema = z.object({
  action: z
    .enum(["remove", "reorder", "list"])
    .describe("Queue action to perform"),
  id: z.string().optional().describe("Deck ID for remove/reorder actions"),
  slug: z.string().optional().describe("Deck slug for remove/reorder actions"),
  position: z
    .number()
    .optional()
    .describe("New queue position for reorder action (1-based)"),
});

export type QueueInput = z.infer<typeof queueInputSchema>;

/**
 * Create the deck:queue tool
 */
export function createQueueTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_queue`,
    description: "Manage the deck publish queue (list, remove, reorder)",
    inputSchema: queueInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { action, id, slug, position } = queueInputSchema.parse(input);

        switch (action) {
          case "list":
            return await handleList(context);
          case "remove":
            return await handleRemove(context, id, slug);
          case "reorder":
            return await handleReorder(context, id, slug, position);
          default:
            return {
              success: false,
              error: `Unknown action: ${action}`,
              formatted: `_Error: Unknown action: ${action}_`,
            };
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}

/**
 * List all queued decks via publish-pipeline
 */
async function handleList(
  context: ServicePluginContext,
): Promise<ToolResponse> {
  // Send list request to publish-pipeline
  await context.sendMessage("publish:list", { entityType: "deck" });

  // Also query locally for immediate response
  const decks = await context.entityService.listEntities<DeckEntity>("deck", {
    filter: { metadata: { status: "queued" } },
    limit: 100,
  });

  if (decks.length === 0) {
    return {
      success: true,
      data: { decks: [] },
      message: "No decks in queue",
      formatted: "_Queue is empty_",
    };
  }

  const items = decks.map((deck, index) => ({
    position: index + 1,
    id: deck.id,
    title: deck.metadata.title,
    slug: deck.metadata.slug,
  }));

  const formatted = formatAsList(items, {
    header: "**Publish Queue**",
    title: (item: { position: number; title: string }) =>
      `${item.position}. ${item.title}`,
    numbered: false,
  });

  return {
    success: true,
    data: { decks: items },
    message: `${decks.length} decks in queue`,
    formatted,
  };
}

/**
 * Remove a deck from the queue via publish-pipeline
 */
async function handleRemove(
  context: ServicePluginContext,
  id?: string,
  slug?: string,
): Promise<ToolResponse> {
  const deck = await findDeck(context, id, slug);
  if (!deck) {
    return notFoundResponse(id, slug);
  }

  if (deck.metadata.status !== "queued") {
    return {
      success: false,
      error: "Deck is not in queue",
      formatted: "_Deck is not in queue_",
    };
  }

  // Send remove message to publish-pipeline
  await context.sendMessage("publish:remove", {
    entityType: "deck",
    entityId: deck.id,
  });

  const formatted = formatAsEntity(
    {
      id: deck.id,
      title: deck.metadata.title,
      status: "draft",
    },
    { title: "Deck Removed from Queue" },
  );

  return {
    success: true,
    data: { deckId: deck.id },
    message: "Deck removed from queue",
    formatted,
  };
}

/**
 * Reorder a deck in the queue via publish-pipeline
 */
async function handleReorder(
  context: ServicePluginContext,
  id?: string,
  slug?: string,
  position?: number,
): Promise<ToolResponse> {
  if (position === undefined || position < 1) {
    return {
      success: false,
      error: "Position must be a positive number",
      formatted: "_Error: Position must be a positive number_",
    };
  }

  const deck = await findDeck(context, id, slug);
  if (!deck) {
    return notFoundResponse(id, slug);
  }

  if (deck.metadata.status !== "queued") {
    return {
      success: false,
      error: "Deck is not in queue",
      formatted: "_Deck is not in queue_",
    };
  }

  // Send reorder message to publish-pipeline
  await context.sendMessage("publish:reorder", {
    entityType: "deck",
    entityId: deck.id,
    position,
  });

  const formatted = formatAsEntity(
    {
      id: deck.id,
      title: deck.metadata.title,
      position,
    },
    { title: "Deck Reordered" },
  );

  return {
    success: true,
    data: { deckId: deck.id, position },
    message: `Deck moved to position ${position}`,
    formatted,
  };
}

/**
 * Find a deck by ID or slug
 */
async function findDeck(
  context: ServicePluginContext,
  id?: string,
  slug?: string,
): Promise<DeckEntity | null> {
  if (id) {
    return context.entityService.getEntity<DeckEntity>("deck", id);
  }
  if (slug) {
    const decks = await context.entityService.listEntities<DeckEntity>("deck", {
      filter: { metadata: { slug } },
      limit: 1,
    });
    return decks[0] ?? null;
  }
  return null;
}

/**
 * Not found response helper
 */
function notFoundResponse(id?: string, slug?: string): ToolResponse {
  const identifier = id ?? slug ?? "unknown";
  return {
    success: false,
    error: `Deck not found: ${identifier}`,
    formatted: `_Deck not found: ${identifier}_`,
  };
}
