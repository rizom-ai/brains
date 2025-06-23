import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EntityService } from "../entity/entityService";
import type { ContentGenerationService } from "../content/contentGenerationService";
import type { ContentRegistry } from "../content/content-registry";
import type { Logger } from "@brains/utils";

/**
 * Register shell resources with an MCP server
 */
export function registerShellResources(
  server: McpServer,
  options: {
    entityService: EntityService;
    contentGenerationService: ContentGenerationService;
    contentRegistry: ContentRegistry;
    logger: Logger;
  },
): void {
  const { logger, entityService, contentGenerationService, contentRegistry } =
    options;

  logger.info("Registering shell resources with MCP server");

  // Register entity resources
  const entityTypes = entityService.getEntityTypes();

  for (const entityType of entityTypes) {
    server.resource(
      `entity_${entityType}`,
      new ResourceTemplate(`entity://${entityType}/{id}`, { list: undefined }),
      { description: `Access ${entityType} entities by ID` },
      async (uri, variables) => {
        try {
          const id = variables["id"];

          if (!id || Array.isArray(id)) {
            throw new Error(`Invalid entity ID in URI: ${uri}`);
          }

          logger.debug(`Reading ${entityType} entity`, { id });

          const entity = await entityService.getEntity(entityType, id);

          if (!entity) {
            throw new Error(`Entity not found: ${entityType}/${id}`);
          }

          return {
            contents: [
              {
                uri: uri.toString(),
                text: JSON.stringify(entity, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error(`Error reading ${entityType} resource`, error);
          throw error;
        }
      },
    );
  }

  // Register a general entities list resource
  server.resource(
    "entity-types",
    "entity://types",
    { description: "List all available entity types" },
    async (uri: URL) => {
      try {
        const types = entityService.getEntityTypes();

        return {
          contents: [
            {
              uri: uri.toString(),
              text: JSON.stringify({ entityTypes: types }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error listing entity types", error);
        throw error;
      }
    },
  );

  // Register a general schemas list resource
  server.resource(
    "schema-list",
    "schema://list",
    { description: "List all registered schemas" },
    async (uri: URL) => {
      try {
        const names = contentRegistry.listContent();

        return {
          contents: [
            {
              uri: uri.toString(),
              text: JSON.stringify({ schemaNames: names }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error listing schemas", error);
        throw error;
      }
    },
  );

  // Register individual schema resources
  const schemaNames = contentRegistry.listContent();

  for (const schemaName of schemaNames) {
    server.resource(
      `schema_${schemaName}`,
      `schema://${schemaName}`,
      { description: `Schema definition for ${schemaName}` },
      async (uri: URL) => {
        try {
          logger.debug("Reading schema resource", { schemaName });

          const schema = contentRegistry.getSchema(schemaName);

          if (!schema) {
            throw new Error(`Schema not found: ${schemaName}`);
          }

          return {
            contents: [
              {
                uri: uri.toString(),
                text: JSON.stringify(
                  {
                    name: schemaName,
                    type: "zod-schema",
                    // We can't serialize the actual Zod schema, so we provide metadata
                    description: `Zod schema for ${schemaName}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          logger.error("Error reading schema resource", error);
          throw error;
        }
      },
    );
  }

  // Register content template list resource
  server.resource(
    "content-templates",
    "template://list",
    { description: "List all available content generation templates" },
    async (uri: URL) => {
      try {
        const templates = contentGenerationService.listTemplates();

        const templateInfo = templates.map((t) => ({
          name: t.name,
          description: t.description,
          schemaType: "zod-schema",
        }));

        return {
          contents: [
            {
              uri: uri.toString(),
              text: JSON.stringify({ templates: templateInfo }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Error listing content templates", error);
        throw error;
      }
    },
  );

  // Register individual template resources
  const templates = contentGenerationService.listTemplates();

  for (const template of templates) {
    server.resource(
      `template_${template.name}`,
      `template://${template.name}`,
      { description: `Content generation template: ${template.description}` },
      async (uri: URL) => {
        try {
          logger.debug("Reading template resource", {
            templateName: template.name,
          });

          const templateInfo = {
            name: template.name,
            description: template.description,
            basePrompt: template.basePrompt,
            schemaType: "zod-schema",
          };

          return {
            contents: [
              {
                uri: uri.toString(),
                text: JSON.stringify(templateInfo, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error("Error reading template resource", error);
          throw error;
        }
      },
    );
  }

  logger.info("Shell resources registered successfully");
}
