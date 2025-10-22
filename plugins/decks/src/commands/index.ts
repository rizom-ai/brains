import type {
  Command,
  CommandResponse,
  ServicePluginContext,
} from "@brains/plugins";
import type { DeckEntity } from "../schemas/deck";
import type { Logger } from "@brains/utils";

export function createDecksCommands(
  context: ServicePluginContext,
  logger: Logger,
): Command[] {
  return [
    {
      name: "decks-list",
      description: "List all presentation decks",
      usage: "/decks-list [--limit <number>]",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          // Parse arguments
          let limit = 10;
          for (let i = 0; i < args.length; i++) {
            if (args[i] === "--limit" && args[i + 1]) {
              limit = parseInt(args[i + 1] as string, 10);
              if (isNaN(limit)) limit = 10;
            }
          }

          // Get all decks using entity service
          const allEntities = await context.entityService.listEntities("deck");
          const decks = allEntities.slice(0, limit) as DeckEntity[];

          if (decks.length === 0) {
            return {
              type: "message",
              message: "No presentation decks found",
            };
          }

          // Format decks for CLI display
          const formatted = decks
            .map((deck) => {
              const parts = [`**${deck.title}** (${deck.id})`];

              if (deck.description) {
                parts.push(deck.description);
              }

              if (deck.author) {
                parts.push(`Author: ${deck.author}`);
              }

              parts.push(
                `Last updated: ${new Date(deck.updated).toLocaleDateString()}`,
              );

              return parts.join("\n");
            })
            .join("\n\n---\n\n");

          return {
            type: "message",
            message: `Found ${decks.length} presentation decks:\n\n${formatted}`,
          };
        } catch (error) {
          logger.error("Error listing decks", { error });
          return {
            type: "message",
            message: `Error listing decks: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
