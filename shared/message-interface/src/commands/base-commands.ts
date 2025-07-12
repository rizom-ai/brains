import type { Command } from "../base/types";
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
      handler: async () => plugin.getHelpText(),
    },
    {
      name: "search",
      description: "Search your knowledge base",
      usage: "/search <query>",
      handler: async (args, context): Promise<string> => {
        if (args.length === 0) {
          return "Please provide a search query. Usage: /search <query>";
        }
        const searchQuery = args.join(" ");
        return plugin.processQuery(searchQuery, context);
      },
    },
    {
      name: "list",
      description: "List entities (notes, tasks, etc.)",
      usage: "/list [type]",
      handler: async (args, context): Promise<string> => {
        const listQuery = args[0] ? `list all ${args[0]}` : "list all notes";
        return plugin.processQuery(listQuery, context);
      },
    },
  ];
}
