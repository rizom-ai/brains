import type { ServicePluginContext } from "@brains/plugins";
import type { RouteRegistry } from "./route-registry";
import type { RouteDefinition } from "../types/routes";

/**
 * Generates dynamic routes for entity types that have matching templates
 */
export class DynamicRouteGenerator {
  constructor(
    private readonly context: ServicePluginContext,
    private readonly routeRegistry: RouteRegistry,
  ) {}

  /**
   * Generate routes for all entity types that have matching list/detail templates
   */
  async generateEntityRoutes(): Promise<void> {
    const logger = this.context.logger.child("DynamicRouteGenerator");

    // Get all registered entity types from entity service
    const entityTypes = this.context.entityService.getEntityTypes();
    logger.debug(`Found ${entityTypes.length} entity types`, { entityTypes });

    for (const entityType of entityTypes) {
      await this.generateRoutesForEntityType(entityType);
    }
  }

  /**
   * Generate routes for a specific entity type
   */
  private async generateRoutesForEntityType(entityType: string): Promise<void> {
    const logger = this.context.logger.child("DynamicRouteGenerator");

    // Try to find matching templates from any plugin
    const { listTemplateName, detailTemplateName } =
      this.findTemplatesForEntityType(entityType);

    if (!listTemplateName && !detailTemplateName) {
      logger.debug(
        `No matching templates found for entity type: ${entityType}`,
      );
      return;
    }

    logger.info(`Generating routes for entity type: ${entityType}`, {
      listTemplate: listTemplateName,
      detailTemplate: detailTemplateName,
    });

    // Register index route if we have a list template
    if (listTemplateName) {
      const indexRoute: RouteDefinition = {
        id: `${entityType}-index`,
        path: `/${this.pluralize(entityType)}`,
        title: `${this.capitalize(entityType)}s`,
        description: `Browse all ${this.pluralize(entityType)}`,
        sections: [
          {
            id: "list",
            template: listTemplateName,
            contentEntity: {
              entityType,
              query: { limit: 100 }, // Reasonable default limit
            },
          },
        ],
        sourceEntityType: entityType,
      };

      try {
        this.routeRegistry.register(indexRoute);
        logger.debug(`Registered index route for ${entityType}`, {
          path: indexRoute.path,
        });
      } catch (error) {
        logger.warn(`Failed to register index route for ${entityType}`, {
          error,
        });
      }
    }

    // Get all entities of this type and create detail routes if we have a detail template
    if (detailTemplateName) {
      try {
        const entities = await this.context.entityService.listEntities(
          entityType,
          { limit: 1000 }, // Get all entities for static generation
        );

        logger.info(
          `Found ${entities.length} ${entityType} entities to generate routes for`,
        );

        for (const entity of entities) {
          const detailRoute: RouteDefinition = {
            id: `${entityType}-${entity.id}`,
            path: `/${this.pluralize(entityType)}/${entity.id}`,
            title: `${this.capitalize(entityType)}: ${entity.id}`,
            description: `View ${entityType} details`,
            sections: [
              {
                id: "detail",
                template: detailTemplateName,
                contentEntity: {
                  entityType,
                  query: { id: entity.id },
                },
              },
            ],
            sourceEntityType: entityType,
          };

          try {
            this.routeRegistry.register(detailRoute);
          } catch (error) {
            logger.warn(
              `Failed to register detail route for ${entityType}/${entity.id}`,
              { error },
            );
          }
        }

        const routeCount = listTemplateName
          ? entities.length + 1
          : entities.length;
        logger.info(
          `Successfully registered ${routeCount} routes for ${entityType}`,
        );
      } catch (error) {
        logger.error(`Failed to list entities for type: ${entityType}`, {
          error,
        });
      }
    }
  }

  /**
   * Find matching list and detail templates for an entity type
   */
  private findTemplatesForEntityType(entityType: string): {
    listTemplateName?: string;
    detailTemplateName?: string;
  } {
    // Get list of all templates to search through
    const allTemplates = this.context.listViewTemplates();

    // Look for templates matching the pattern [entityType]-list/detail
    let listTemplateName: string | undefined;
    let detailTemplateName: string | undefined;

    for (const template of allTemplates) {
      const templateName = template.name;

      // Check for list template
      if (templateName.endsWith(`${entityType}-list`)) {
        listTemplateName = templateName;
      }

      // Check for detail template
      if (templateName.endsWith(`${entityType}-detail`)) {
        detailTemplateName = templateName;
      }
    }

    // Return found templates (allow list-only or detail-only)
    const result: {
      listTemplateName?: string;
      detailTemplateName?: string;
    } = {};

    if (listTemplateName) {
      result.listTemplateName = listTemplateName;
    }
    if (detailTemplateName) {
      result.detailTemplateName = detailTemplateName;
    }

    return result;
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Simple pluralization (can be enhanced with proper inflection library)
   */
  private pluralize(word: string): string {
    // Handle common cases
    if (word.endsWith("y")) {
      return word.slice(0, -1) + "ies";
    }
    if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch")) {
      return word + "es";
    }
    return word + "s";
  }
}
