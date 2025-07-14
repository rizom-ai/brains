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
      handler: async (args, context): Promise<MessageResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Please provide a search query. Usage: /search <query>",
          };
        }
        const searchQuery = args.join(" ");
        const result = await plugin.processQuery(searchQuery, context);
        return {
          type: "message",
          message: result,
        };
      },
    },
    {
      name: "list",
      description: "List entities (notes, tasks, etc.)",
      usage: "/list [type]",
      handler: async (args, context): Promise<MessageResponse> => {
        const listQuery = args[0] ? `list all ${args[0]}` : "list all notes";
        const result = await plugin.processQuery(listQuery, context);
        return {
          type: "message",
          message: result,
        };
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
