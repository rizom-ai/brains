import type { Command, MessageResponse } from "../base/types";
import type { MessageInterfacePlugin } from "../base/message-interface-plugin";

/**
 * Get base commands available to all message interfaces
 */
export function getBaseCommands(
  plugin: MessageInterfacePlugin<unknown>,
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
  ];
}
