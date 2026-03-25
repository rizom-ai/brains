import { MCPBridgePlugin } from "@brains/mcp-bridge";
import type { ServerCommand } from "@brains/mcp-bridge";
import { notionConfigSchema, type NotionConfig } from "./config";
import packageJson from "../package.json";

/**
 * Notion plugin — read-only access to a user's Notion workspace.
 *
 * Spawns the official @notionhq/notion-mcp-server as a child process,
 * connects via MCP SDK, and exposes only read tools to the agent.
 */
export class NotionPlugin extends MCPBridgePlugin<NotionConfig> {
  constructor(config: Partial<NotionConfig> = {}) {
    super("notion", packageJson, config, notionConfigSchema);
  }

  protected getServerCommand(): ServerCommand {
    return {
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: {
        OPENAPI_MCP_HEADERS: JSON.stringify({
          Authorization: `Bearer ${this.config.token}`,
          "Notion-Version": "2022-06-28",
        }),
      },
    };
  }

  protected getAllowedTools(): string[] {
    return [
      "search",
      "read_page",
      "retrieve_block_children",
      "list_databases",
      "query_database",
    ];
  }

  protected getAgentInstructions(): string {
    return [
      "## Notion Integration",
      "",
      "Use notion_* tools to look up information in the user's Notion workspace.",
      "Use the brain's own tools (system_search, system_create, etc.) for the brain's knowledge base.",
      "Only read tools are available — never attempt to write to Notion.",
      "",
      "Available tools:",
      "- **notion_search**: Search for pages by query",
      "- **notion_read_page**: Read a page by ID",
      "- **notion_retrieve_block_children**: Get child blocks of a page/block",
      "- **notion_list_databases**: List all databases",
      "- **notion_query_database**: Query a database with filters",
    ].join("\n");
  }
}
