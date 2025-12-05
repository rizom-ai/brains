import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";

// Schema for tool parameters
const listParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  status: z
    .enum(["draft", "presented"])
    .optional()
    .describe("Filter by deck status"),
});

const getParamsSchema = z.object({
  id: z.string().optional().describe("Deck ID"),
  slug: z.string().optional().describe("Deck slug"),
});

/**
 * Create decks plugin tools
 */
export function createDecksTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  return [
    {
      name: `${pluginId}_list`,
      description: "List all presentation decks",
      inputSchema: listParamsSchema.shape,
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const { limit, status } = listParamsSchema.parse(input);

        try {
          const decks = await context.entityService.listEntities<DeckEntity>(
            "deck",
            {
              limit,
              ...(status && { filter: { metadata: { status } } }),
            },
          );

          return {
            success: true,
            data: {
              decks: decks.map((deck) => ({
                id: deck.id,
                title: deck.metadata.title,
                slug: deck.metadata.slug,
                status: deck.metadata.status,
                presentedAt: deck.metadata.presentedAt,
                event: deck.event,
                updated: deck.updated,
              })),
              count: decks.length,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}_get`,
      description: "Get a specific presentation deck by ID or slug",
      inputSchema: getParamsSchema.shape,
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const { id, slug } = getParamsSchema.parse(input);

        if (!id && !slug) {
          return {
            success: false,
            error: "Either 'id' or 'slug' must be provided",
          };
        }

        try {
          let deck: DeckEntity | null = null;

          if (id) {
            deck = await context.entityService.getEntity<DeckEntity>(
              "deck",
              id,
            );
          } else if (slug) {
            const decks = await context.entityService.listEntities<DeckEntity>(
              "deck",
              {
                filter: { metadata: { slug } },
                limit: 1,
              },
            );
            deck = decks[0] ?? null;
          }

          if (!deck) {
            return {
              success: false,
              error: `Deck not found: ${id ?? slug}`,
            };
          }

          return {
            success: true,
            data: {
              id: deck.id,
              title: deck.title,
              description: deck.description,
              author: deck.author,
              status: deck.metadata.status,
              presentedAt: deck.metadata.presentedAt,
              event: deck.event,
              content: deck.content,
              created: deck.created,
              updated: deck.updated,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  ];
}
