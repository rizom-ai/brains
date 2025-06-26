/**
 * MCP (Model Context Protocol) integration for shell package
 *
 * This module provides functions to register shell's tools and resources
 * with an MCP server. The shell package doesn't depend on the MCP server
 * package - instead, it receives an MCP server instance and registers its
 * capabilities with it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EntityService } from "../entity/entityService";
import type { ContentGenerator } from "@brains/content-generator";
import type { Logger } from "@brains/utils";

export interface ShellMCPOptions {
  contentGenerator: ContentGenerator;
  entityService: EntityService;
  logger: Logger;
}

/**
 * Register all shell capabilities (tools and resources) with an MCP server
 */
export function registerShellMCP(
  server: McpServer,
  options: ShellMCPOptions,
): void {
  // Register core shell query tool
  server.tool(
    "query",
    "Query the knowledge base using AI-powered search",
    {
      query: {
        type: "string",
        description: "Natural language query to search the knowledge base",
      },
      userId: {
        type: "string",
        description: "Optional user ID for context",
        optional: true,
      },
    },
    async (params) => {
      try {
        const result = await options.contentGenerator.generateContent(
          "shell:knowledge-query",
          {
            prompt: params["query"] as string,
            data: {
              userId: params["userId"],
            },
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        options.logger.error("Query tool error", error);
        throw error;
      }
    },
  );
}
