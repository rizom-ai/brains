import type {
  Command,
  CommandContext,
  CommandResponse,
} from "@brains/command-registry";
import type { Shell } from "../shell";
import type { EntityService } from "@brains/entity-service";

export function createSearchCommand(shell: Shell): Command {
  return {
    name: "search",
    description: "Search your knowledge base",
    usage: "/search <query>",
    handler: async (
      args: string[],
      _context: CommandContext,
    ): Promise<CommandResponse> => {
      if (args.length === 0) {
        return {
          type: "message",
          message: "Please provide a search query. Usage: /search <query>",
        };
      }

      const searchQuery = args.join(" ");
      const entityService = shell
        .getServiceRegistry()
        .resolve("entityService") as EntityService;

      try {
        const searchResults = await entityService.search(searchQuery, {
          limit: 5,
          sortBy: "relevance",
        });

        if (searchResults.length === 0) {
          return {
            type: "message",
            message: `No results found for "${searchQuery}"`,
          };
        }

        // Format search results
        const formatted = searchResults
          .map((result) => {
            const entity = result.entity;
            const preview =
              entity.content.substring(0, 200) +
              (entity.content.length > 200 ? "..." : "");

            return [
              `**${entity.metadata?.["title"] ?? entity.id}**`,
              `Type: ${entity.entityType} | Score: ${result.score.toFixed(2)}`,
              ``,
              preview,
            ].join("\n");
          })
          .join("\n\n---\n\n");

        return {
          type: "message",
          message: `Found ${searchResults.length} results for "${searchQuery}":\n\n${formatted}`,
        };
      } catch (error) {
        return {
          type: "message",
          message: `Error searching entities: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
