import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { QueryProcessor } from "../query/queryProcessor";
import type { BrainProtocol } from "../protocol/brainProtocol";
import type { EntityService } from "../entity/entityService";
import type { SchemaRegistry } from "../schema/schemaRegistry";
import type { Logger } from "@brains/utils";
import {
  QueryProcessorAdapter,
  BrainProtocolAdapter,
  EntityServiceAdapter,
} from "./adapters";

/**
 * Register shell tools with an MCP server
 */
export function registerShellTools(
  server: McpServer,
  options: {
    queryProcessor: QueryProcessor;
    brainProtocol: BrainProtocol;
    entityService: EntityService;
    schemaRegistry: SchemaRegistry;
    logger: Logger;
  },
): void {
  const {
    logger,
    queryProcessor,
    brainProtocol,
    entityService,
    schemaRegistry,
  } = options;

  // Create adapters
  const queryAdapter = new QueryProcessorAdapter(
    queryProcessor,
    schemaRegistry,
  );
  const commandAdapter = new BrainProtocolAdapter(brainProtocol);
  const entityAdapter = new EntityServiceAdapter(entityService);

  logger.info("Registering shell tools with MCP server");

  // Register query tool
  server.tool(
    "brain_query",
    {
      query: z.string().describe("The query to execute"),
      options: z
        .object({
          limit: z.number().optional().describe("Maximum number of results"),
          context: z
            .record(z.unknown())
            .optional()
            .describe("Additional context for the query"),
          responseSchema: z
            .string()
            .optional()
            .describe("Name of the response schema to use"),
        })
        .optional()
        .describe("Query execution options"),
    },
    async (params) => {
      try {
        logger.debug("Executing brain_query tool", { query: params.query });

        const result = await queryAdapter.executeQuery(params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in brain_query tool", error);
        throw error;
      }
    },
  );

  // Register command tool
  server.tool(
    "brain_command",
    {
      command: z.string().describe("The command to execute"),
      args: z.array(z.unknown()).optional().describe("Command arguments"),
      context: z.record(z.unknown()).optional().describe("Additional context"),
    },
    async (params) => {
      try {
        logger.debug("Executing brain_command tool", {
          command: params.command,
          args: params.args,
          context: params.context,
        });

        const result = await commandAdapter.executeCommand(params);
        logger.debug("Command result", { result });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in brain_command tool", error);
        throw error;
      }
    },
  );

  // Register entity search tool
  server.tool(
    "entity_search",
    {
      entityType: z.string().describe("The type of entity to search for"),
      query: z.string().describe("Search query"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of results"),
    },
    async (params) => {
      try {
        logger.debug("Executing entity_search tool", params);

        const results = await entityAdapter.searchEntities(params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in entity_search tool", error);
        throw error;
      }
    },
  );

  // Register entity get tool
  server.tool(
    "entity_get",
    {
      entityType: z.string().describe("The type of entity"),
      entityId: z.string().describe("The entity ID"),
    },
    async (params) => {
      try {
        logger.debug("Executing entity_get tool", params);

        const entity = await entityAdapter.getEntity(
          params.entityType,
          params.entityId,
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
        logger.error("Error in entity_get tool", error);
        throw error;
      }
    },
  );

  logger.info("Shell tools registered successfully");
}
