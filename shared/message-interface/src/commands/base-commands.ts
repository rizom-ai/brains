import type { Command, MessageResponse } from "../base/types";
import type { MessageInterfacePlugin } from "../base/message-interface-plugin";
import type { PluginContext } from "@brains/plugin-utils";

/**
 * Get base commands available to all message interfaces
 */
export function getBaseCommands(
  plugin: MessageInterfacePlugin<unknown>,
  context: PluginContext | undefined,
): Command[] {
  return [
    {
      name: "help",
      description: "Show this help message",
      handler: async (): Promise<MessageResponse> => ({
        type: "message",
        message: await plugin.getHelpText(),
      }),
    },
    {
      name: "search",
      description: "Search your knowledge base",
      usage: "/search <query>",
      handler: async (args, _context): Promise<MessageResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Please provide a search query. Usage: /search <query>",
          };
        }

        if (!context?.entityService) {
          return {
            type: "message",
            message: "Entity service not available",
          };
        }

        const searchQuery = args.join(" ");

        try {
          const searchResults = await context.entityService.search(searchQuery, {
            limit: 10,
            sortBy: "relevance",
          });

          if (searchResults.length === 0) {
            return {
              type: "message",
              message: `No results found for "${searchQuery}"`,
            };
          }

          // Format search results using template system
          const formatted = searchResults.map((result, index) => {
            const formattedEntity = context.formatContent(
              "shell:base-entity-display", 
              result.entity,
              { truncate: 200 }
            );
            
            return `${index + 1}. Score: ${result.score.toFixed(2)}
${formattedEntity}
${result.excerpt ? `Excerpt: ${result.excerpt}` : ''}`;
          }).join("\n\n");

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
    },
    {
      name: "list",
      description: "List entities",
      usage: "/list [type]",
      handler: async (args, _context): Promise<MessageResponse> => {
        if (!context?.entityService) {
          return {
            type: "message",
            message: "Entity service not available",
          };
        }

        const entityType = args[0] || "base";

        try {
          const entities = await context.entityService.listEntities(entityType, {
            limit: 20,
            sortBy: "updated",
            sortDirection: "desc",
          });

          if (entities.length === 0) {
            return {
              type: "message",
              message: `No ${entityType} entities found`,
            };
          }

          // Format list results using template system
          const formatted = entities.map((entity, index) => {
            const formattedEntity = context.formatContent(
              "shell:base-entity-display", 
              entity,
              { truncate: 150 }
            );
            
            return `${index + 1}. ${formattedEntity}`;
          }).join("\n\n");

          return {
            type: "message",
            message: `Found ${entities.length} ${entityType} entities:\n\n${formatted}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error listing entities: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "show-entity",
      description: "Show detailed information about an entity",
      usage: "/show-entity <entity-id> [entity-type]",
      handler: async (args, _context): Promise<MessageResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message:
              "Please provide an entity ID. Usage: /show-entity <entity-id> [entity-type]",
          };
        }

        const entityId = args[0];
        const entityType = args[1] || "base"; // Default to base entity type

        if (!entityId) {
          return {
            type: "message",
            message:
              "Entity ID is required. Usage: /show-entity <entity-id> [entity-type]",
          };
        }

        if (!context?.entityService) {
          return {
            type: "message",
            message: "Entity service not available",
          };
        }

        try {
          const entity = await context.entityService.getEntity(
            entityType,
            entityId,
          );

          if (!entity) {
            return {
              type: "message",
              message: `Entity with ID "${entityId}" not found`,
            };
          }

          // Use the template system to format the entity
          const formatted = context.formatContent(
            "shell:base-entity-display",
            entity,
          );

          return {
            type: "message",
            message: formatted,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error retrieving entity: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
