/**
 * MCP (Model Context Protocol) integration for shell package
 *
 * This module provides functions to register shell's tools and resources
 * with an MCP server. The shell package doesn't depend on the MCP server
 * package - instead, it receives an MCP server instance and registers its
 * capabilities with it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EntityService } from "@brains/entity-service";
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
    "shell:query",
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

  // Register entity search tool
  server.tool(
    "shell:search",
    "Search entities by type and query",
    {
      entityType: {
        type: "string",
        description: "Type of entity to search (e.g., 'note', 'base')",
      },
      query: {
        type: "string", 
        description: "Search query",
      },
      limit: {
        type: "number",
        description: "Maximum number of results",
        optional: true,
      },
    },
    async (params) => {
      try {
        const results = await options.entityService.search(
          params["query"] as string,
          {
            entityType: params["entityType"] as string,
            limit: (params["limit"] as number) || 10,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        options.logger.error("Search tool error", error);
        throw error;
      }
    },
  );

  // Register entity get tool
  server.tool(
    "shell:get",
    "Get a specific entity by ID and type",
    {
      entityType: {
        type: "string",
        description: "Type of entity to retrieve",
      },
      id: {
        type: "string",
        description: "Entity ID",
      },
    },
    async (params) => {
      try {
        const entity = await options.entityService.getEntity(
          params["entityType"] as string,
          params["id"] as string,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(entity, null, 2),
            },
          ],
        };
      } catch (error) {
        options.logger.error("Get tool error", error);
        throw error;
      }
    },
  );

  // Register entity types resource
  server.resource(
    "entity-types",
    "entity://types",
    { 
      mimeType: "application/json",
      description: "List all available entity types"
    },
    async (uri) => {
      try {
        const types = options.entityService.getSupportedEntityTypes();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(types, null, 2),
            },
          ],
        };
      } catch (error) {
        options.logger.error("Entity types resource error", error);
        throw error;
      }
    },
  );

  // Register schema list resource
  server.resource(
    "schema-list",
    "schema://list",
    { 
      mimeType: "application/json",
      description: "List all available entity schemas"
    },
    async (uri) => {
      try {
        const types = options.entityService.getSupportedEntityTypes();
        const schemas = types.reduce((acc, type) => {
          acc[type] = `Schema for ${type} entities`;
          return acc;
        }, {} as Record<string, string>);
        
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(schemas, null, 2),
            },
          ],
        };
      } catch (error) {
        options.logger.error("Schema list resource error", error);
        throw error;
      }
    },
  );
}
