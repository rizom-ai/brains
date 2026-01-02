import type {
  PluginTool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { DeckEntity } from "../schemas/deck";
import { DeckFormatter } from "../formatters/deck-formatter";

/**
 * Input schema for deck:publish tool
 */
export const publishInputSchema = z.object({
  id: z.string().optional().describe("Deck ID"),
  slug: z.string().optional().describe("Deck slug"),
  direct: z
    .boolean()
    .optional()
    .default(true)
    .describe("Publish immediately (true) or add to queue (false)"),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

// Frontmatter schema for deck markdown files
const deckFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  status: z.enum(["draft", "queued", "published"]).default("draft"),
  publishedAt: z.string().datetime().optional(),
  event: z.string().optional(),
});

/**
 * Create the deck:publish tool
 */
export function createPublishTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool {
  const formatter = new DeckFormatter();

  return {
    name: `${pluginId}_publish`,
    description:
      "Publish a deck immediately (direct=true) or add to queue for scheduled publishing (direct=false)",
    inputSchema: publishInputSchema.shape,
    visibility: "anchor",
    handler: async (input: unknown): Promise<ToolResponse> => {
      try {
        const { id, slug, direct } = publishInputSchema.parse(input);

        // Validate that at least one identifier is provided
        if (!id && !slug) {
          return {
            success: false,
            error: "Either 'id' or 'slug' must be provided",
            formatted: "_Error: Either 'id' or 'slug' must be provided_",
          };
        }

        // Get deck entity by ID or slug
        let deck: DeckEntity | null = null;

        if (id) {
          // Try to get by ID first
          deck = await context.entityService.getEntity<DeckEntity>("deck", id);
        } else if (slug) {
          // Search by slug in metadata
          const decks = await context.entityService.listEntities<DeckEntity>(
            "deck",
            {
              filter: { metadata: { slug } },
              limit: 1,
            },
          );
          deck = decks[0] ?? null;
        }

        if (!deck?.content) {
          const identifier = id ?? slug;
          return {
            success: false,
            error: `Deck not found: ${identifier}`,
            formatted: `_Deck not found: ${identifier}_`,
          };
        }

        // Parse frontmatter from content
        const parsed = parseMarkdownWithFrontmatter(
          deck.content,
          deckFrontmatterSchema,
        );

        // Handle queue mode (direct=false)
        if (!direct) {
          // Cannot queue already published decks
          if (deck.metadata.status === "published") {
            return {
              success: false,
              error: "Deck is already published",
              formatted: "_Deck is already published_",
            };
          }

          // Update status to queued
          const queuedDeck: DeckEntity = {
            ...deck,
            status: "queued",
            metadata: {
              ...deck.metadata,
              status: "queued",
            },
          };

          const queuedContent = formatter.toMarkdown(queuedDeck);
          await context.entityService.updateEntity({
            ...queuedDeck,
            content: queuedContent,
          });

          // Send queue message to publish-pipeline
          await context.sendMessage("publish:queue", {
            entityType: "deck",
            entityId: deck.id,
          });

          const formatted = formatAsEntity(
            {
              id: deck.id,
              title: parsed.metadata.title,
              status: "queued",
            },
            { title: "Deck Queued" },
          );

          return {
            success: true,
            data: { deckId: deck.id },
            message: `Deck "${parsed.metadata.title}" added to queue`,
            formatted,
          };
        }

        // Direct publish mode (default)
        const publishedAt = new Date().toISOString();
        const updatedDeck: DeckEntity = {
          ...deck,
          status: "published",
          publishedAt,
          metadata: {
            ...deck.metadata,
            status: "published",
            publishedAt,
          },
        };

        // Use formatter to generate markdown with frontmatter
        const updatedContent = formatter.toMarkdown(updatedDeck);

        const result = await context.entityService.updateEntity({
          ...updatedDeck,
          content: updatedContent,
        });

        const formatted = formatAsEntity(
          {
            id: deck.id,
            title: parsed.metadata.title,
            slug: deck.metadata.slug,
            status: "published",
            publishedAt,
          },
          { title: "Deck Published" },
        );

        return {
          success: true,
          data: { ...result, deck: updatedDeck },
          message: `Deck "${parsed.metadata.title}" published successfully`,
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
  };
}
