import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { QueryProcessor } from "../query/queryProcessor";
import type { EntityService } from "../entity/entityService";
import type { SchemaRegistry } from "../schema/schemaRegistry";
import type { ContentGenerationService } from "../content/contentGenerationService";
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
    schemaRegistry: SchemaRegistry;
    contentGenerationService: ContentGenerationService;
    logger: Logger;
  },
): void {
  const {
    logger,
    queryProcessor,
    entityService,
    schemaRegistry,
    contentGenerationService,
  } = options;

  // Create adapters
  const queryAdapter = new QueryProcessorAdapter(
    queryProcessor,
    schemaRegistry,
  );
  const entityAdapter = new EntityServiceAdapter(entityService);
  const contentAdapter = new ContentGenerationAdapter(
    contentGenerationService,
    schemaRegistry,
    entityService,
  );

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

  // Register content generation tool
  server.tool(
    "generate_content",
    {
      prompt: z.string().describe("The prompt for content generation"),
      schemaName: z
        .string()
        .describe("Name of the schema to use for structured output"),
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
        .describe("Save as generated-content entity"),
      contentType: z
        .string()
        .optional()
        .describe("Content type identifier for categorization"),
    },
    async (params) => {
      try {
        logger.debug("Executing generate_content tool", {
          prompt: params.prompt,
          save: params.save,
        });

        const result = await contentAdapter.generateContent(params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in generate_content tool", error);
        throw error;
      }
    },
  );

  // Register generate from template tool
  server.tool(
    "generate_from_template",
    {
      templateName: z.string().describe("Name of the template to use"),
      prompt: z
        .string()
        .describe("Additional prompt to customize the template"),
      context: z
        .object({
          data: z
            .record(z.unknown())
            .optional()
            .describe("Data to populate the template"),
          style: z
            .string()
            .optional()
            .describe("Style guidelines for the generated content"),
        })
        .optional()
        .describe("Context for template generation"),
    },
    async (params) => {
      try {
        logger.debug("Executing generate_from_template tool", {
          templateName: params.templateName,
        });

        const result = await contentAdapter.generateFromTemplate(params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in generate_from_template tool", error);
        throw error;
      }
    },
  );

  // Register list templates tool
  server.tool("list_content_templates", {}, async () => {
    try {
      logger.debug("Executing list_content_templates tool");

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
      logger.error("Error in list_content_templates tool", error);
      throw error;
    }
  });

  // Register promote generated content tool
  server.tool(
    "promote_generated_content",
    {
      generatedContentId: z
        .string()
        .describe("ID of the generated-content entity"),
      targetEntityType: z.string().describe("Target entity type to promote to"),
      additionalFields: z
        .record(z.unknown())
        .optional()
        .describe("Additional fields for the target entity"),
      deleteOriginal: z
        .boolean()
        .optional()
        .default(false)
        .describe("Delete the source generated-content entity after promotion"),
    },
    async (params) => {
      try {
        logger.debug("Executing promote_generated_content tool", params);

        const result = await contentAdapter.promoteGeneratedContent(params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error in promote_generated_content tool", error);
        throw error;
      }
    },
  );

  logger.info("Shell tools registered successfully");
}
