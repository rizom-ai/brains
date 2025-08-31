import type {
  Command,
  CommandResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { LinkService } from "../lib/link-service";

/**
 * Create link plugin commands for CLI/chat interface
 */
export function createLinkCommands(
  _pluginId: string,
  context: ServicePluginContext,
): Command[] {
  const linkService = new LinkService(context);

  return [
    {
      name: "link-capture",
      description: "Capture a web link with AI-powered content extraction",
      usage: "/link-capture <url> [--tags tag1,tag2,...]",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          // Parse arguments
          if (args.length === 0) {
            return {
              type: "message",
              message: "Usage: /link-capture <url> [--tags tag1,tag2,...]",
            };
          }

          const url = args[0] as string;
          let tags: string[] = [];

          // Parse tags if provided
          for (let i = 1; i < args.length; i++) {
            if (args[i] === "--tags" && args[i + 1]) {
              tags = (args[i + 1] as string).split(",").map(tag => tag.trim());
              break;
            }
          }

          const result = await linkService.captureLink(url, tags);

          return {
            type: "message",
            message: `✅ Successfully captured link: **${result.title}**\n\nURL: ${result.url}\nEntity ID: ${result.entityId}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Failed to capture link: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "link-list",
      description: "List captured links",
      usage: "/link-list [--limit <number>]",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          // Parse limit argument
          let limit = 10;
          for (let i = 0; i < args.length; i++) {
            if (args[i] === "--limit" && args[i + 1]) {
              limit = parseInt(args[i + 1] as string, 10);
              if (isNaN(limit) || limit < 1 || limit > 100) {
                return {
                  type: "message",
                  message: "Limit must be a number between 1 and 100",
                };
              }
              break;
            }
          }

          const links = await linkService.listLinks(limit);

          if (links.length === 0) {
            return {
              type: "message",
              message: "No links found.",
            };
          }

          const linkList = links
            .map((link, index) => 
              `${index + 1}. **${link.title}**\n   URL: ${link.url}\n   Domain: ${link.domain}\n   Tags: ${link.tags.join(", ") || "None"}\n   Captured: ${new Date(link.capturedAt).toLocaleDateString()}`
            )
            .join("\n\n");

          return {
            type: "message",
            message: `📋 **Captured Links** (${links.length})\n\n${linkList}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Failed to list links: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "link-search",
      description: "Search captured links",
      usage: "/link-search [query] [--tags tag1,tag2,...] [--limit <number>]",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          let query: string | undefined;
          let tags: string[] = [];
          let limit = 20;

          // Parse arguments
          let i = 0;
          while (i < args.length) {
            const arg = args[i] as string;
            
            if (arg === "--tags" && args[i + 1]) {
              tags = (args[i + 1] as string).split(",").map(tag => tag.trim());
              i += 2;
            } else if (arg === "--limit" && args[i + 1]) {
              limit = parseInt(args[i + 1] as string, 10);
              if (isNaN(limit) || limit < 1 || limit > 100) {
                return {
                  type: "message",
                  message: "Limit must be a number between 1 and 100",
                };
              }
              i += 2;
            } else if (!arg.startsWith("--") && !query) {
              query = arg;
              i++;
            } else {
              i++;
            }
          }

          const links = await linkService.searchLinks(query, tags.length > 0 ? tags : undefined, limit);

          if (links.length === 0) {
            const searchTerms = [];
            if (query) searchTerms.push(`query: "${query}"`);
            if (tags.length > 0) searchTerms.push(`tags: ${tags.join(", ")}`);
            
            return {
              type: "message",
              message: `No links found${searchTerms.length > 0 ? ` for ${searchTerms.join(" and ")}` : ""}.`,
            };
          }

          const linkList = links
            .map((link, index) => 
              `${index + 1}. **${link.title}**\n   URL: ${link.url}\n   Domain: ${link.domain}\n   Tags: ${link.tags.join(", ") || "None"}\n   Description: ${link.description}`
            )
            .join("\n\n");

          const searchInfo = [];
          if (query) searchInfo.push(`query: "${query}"`);
          if (tags.length > 0) searchInfo.push(`tags: ${tags.join(", ")}`);

          return {
            type: "message",
            message: `🔍 **Search Results** (${links.length})${searchInfo.length > 0 ? ` for ${searchInfo.join(" and ")}` : ""}\n\n${linkList}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Failed to search links: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "link-get",
      description: "Get details of a specific link",
      usage: "/link-get <entity-id>",
      handler: async (args, _context): Promise<CommandResponse> => {
        try {
          if (args.length === 0) {
            return {
              type: "message",
              message: "Usage: /link-get <entity-id>",
            };
          }

          const entityId = args[0] as string;
          const link = await linkService.getLink(entityId);

          if (!link) {
            return {
              type: "message",
              message: `Link not found: ${entityId}`,
            };
          }

          const content = `📄 **${link.title}**

**URL:** ${link.url}
**Domain:** ${link.domain}
**Tags:** ${link.tags.join(", ") || "None"}
**Captured:** ${new Date(link.capturedAt).toLocaleDateString()}

**Description:**
${link.description}

**Summary:**
${link.summary}

**Content Preview:**
${link.content.length > 500 ? link.content.substring(0, 500) + "..." : link.content}`;

          return {
            type: "message",
            message: content,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Failed to get link: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}