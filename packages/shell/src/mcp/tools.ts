import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { QueryProcessor } from "../query/queryProcessor";
import type { EntityService } from "../entity/entityService";
import type { ContentGenerationService } from "../content/contentGenerationService";
import type { ContentRegistry } from "../content/content-registry";
import type { Logger } from "@brains/utils";
import { baseEntitySchema } from "@brains/types";
import {
  QueryProcessorAdapter,
  EntityServiceAdapter,
  ContentGenerationAdapter,
} from "./adapters";

/**
 * Register shell tools with an MCP server
 */
export function registerShellTools(
  server: McpServer,
  options: {
    queryProcessor: QueryProcessor;
    entityService: EntityService;
    contentRegistry: ContentRegistry;
    contentGenerationService: ContentGenerationService;
    logger: Logger;
  },
): void {
  const {
    logger,
    queryProcessor,
    entityService,
    contentRegistry,
    contentGenerationService,
  } = options;

  // Create adapters
  const queryAdapter = new QueryProcessorAdapter(
    queryProcessor,
    contentRegistry,
  );
  const entityAdapter = new EntityServiceAdapter(entityService);
  const contentAdapter = new ContentGenerationAdapter(contentGenerationService);

  logger.info("Registering shell tools with MCP server");

  // Register query tool (PUBLIC)
  server.tool(
    "shell:query",
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
            .describe(
              "Name of response schema (default: shell:query-response)",
            ),
        })
        .optional()
        .describe("Query execution options"),
    },
    async (params) => {
      try {
        logger.debug("Executing shell:query tool", { query: params.query });

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
        logger.error("Error in shell:query tool", error);
        throw error;
      }
    },
  );

  // Register entity search tool (PUBLIC)
  server.tool(
    "shell:search",
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
        logger.debug("Executing shell:search tool", params);

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
        logger.error("Error in shell:search tool", error);
        throw error;
      }
    },
  );

  // Register entity get tool (PUBLIC)
  server.tool(
    "shell:get",
    {
      entityType: z.string().describe("The type of entity"),
      entityId: z.string().describe("The entity ID"),
    },
    async (params) => {
      try {
        logger.debug("Executing shell:get tool", params);

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
        logger.error("Error in shell:get tool", error);
        throw error;
      }
    },
  );

  // Register content generation tool (ANCHOR ONLY)
  server.tool(
    "shell:generate",
    {
      prompt: z.string().describe("The prompt for content generation"),
      contentType: z
        .string()
        .describe("Content type identifier for the generated content"),
      context: z
        .object({
          entities: z
            .array(baseEntitySchema)
            .optional()
            .describe("Entities to include as context"),
          data: z
            .record(z.unknown())
            .optional()
            .describe("Additional data context for generation"),
          style: z
            .string()
            .optional()
            .describe("Style guidelines for the generated content"),
          examples: z
            .array(z.unknown())
            .optional()
            .describe("Example outputs to guide generation"),
        })
        .optional()
        .describe("Additional context for content generation"),
      save: z
        .boolean()
        .optional()
        .default(false)
        .describe("Save generated content as entity"),
    },
    async (params) => {
      try {
        logger.debug("Executing shell:generate tool", {
          prompt: params.prompt,
          save: params.save,
        });

        // Get schema from content registry
        const schema = contentRegistry.getSchema(params.contentType);
        if (!schema) {
          throw new Error(
            `Schema not found for content type: ${params.contentType}`,
          );
        }

        const result = await contentAdapter.generateContent({
          ...params,
          schema,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in shell:generate tool", error);
        throw error;
      }
    },
  );

  // Register list templates tool (PUBLIC)
  server.tool("shell:list_templates", {}, async () => {
    try {
      logger.debug("Executing shell:list_templates tool");

      const templates = await contentAdapter.listTemplates();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(templates, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Error in shell:list_templates tool", error);
      throw error;
    }
  });

  logger.info("Shell tools registered successfully");
}
