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
  id: z.string().describe("Deck title, ID, or slug"),
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
      description:
        "List presentation decks/slides. Use when users ask about talks, presentations, or slide decks. Can filter by status (draft/presented).",
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
      description:
        "View a presentation deck. Use when users want to see slides, view a talk, or read presentation content. Accepts title, ID, or slug.",
      inputSchema: getParamsSchema.shape,
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const { id } = getParamsSchema.parse(input);

        try {
          // Try direct ID lookup first
          let deck = await context.entityService.getEntity<DeckEntity>(
            "deck",
            id,
          );

          // If not found, try by slug
          if (!deck) {
            const bySlug = await context.entityService.listEntities<DeckEntity>(
              "deck",
              { limit: 1, filter: { metadata: { slug: id } } },
            );
            deck = bySlug[0] ?? null;
          }

          // If still not found, try by title
          if (!deck) {
            const byTitle =
              await context.entityService.listEntities<DeckEntity>("deck", {
                limit: 1,
                filter: { metadata: { title: id } },
              });
            deck = byTitle[0] ?? null;
          }

          if (!deck) {
            return {
              success: false,
              error: `Deck not found: ${id}`,
              formatted: `_Deck not found: ${id}_`,
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
