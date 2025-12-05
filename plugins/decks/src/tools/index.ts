import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z, formatAsList, formatAsEntity } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";

// Schema for tool parameters
const listParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  status: z.enum(["draft", "presented", "all"]).default("all"),
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
              ...(status !== "all" && { filter: { metadata: { status } } }),
            },
          );

          const deckData = decks.map((deck) => ({
            id: deck.id,
            title: deck.metadata.title,
            slug: deck.metadata.slug,
            status: deck.metadata.status,
            presentedAt: deck.metadata.presentedAt,
            event: deck.event,
            updated: deck.updated,
          }));

          const statusLabel =
            status === "all"
              ? ""
              : ` ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          const formatted = formatAsList(deckData, {
            title: (d) => d.title,
            subtitle: (d) => d.event ?? d.status,
            header: `##${statusLabel} Decks (${deckData.length})`,
          });

          return {
            success: true,
            data: {
              decks: deckData,
              count: decks.length,
            },
            formatted,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            formatted: `_Error: ${msg}_`,
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
            formatted: "_Error: Either 'id' or 'slug' must be provided_",
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
              formatted: `_Deck not found: ${id ?? slug}_`,
            };
          }

          const formatted = formatAsEntity(
            {
              id: deck.id,
              title: deck.title,
              status: deck.metadata.status,
              event: deck.event ?? "N/A",
              presentedAt: deck.metadata.presentedAt ?? "N/A",
            },
            { title: deck.title },
          );

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
            formatted,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            formatted: `_Error: ${msg}_`,
          };
        }
      },
    },
  ];
}
