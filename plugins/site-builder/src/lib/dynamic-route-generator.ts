import type { ServicePluginContext } from "@brains/plugins";
import type { RouteRegistry } from "./route-registry";
import type { RouteDefinition, NavigationSlot } from "../types/routes";
import type { EntityRouteConfig } from "../config";
import { pluralize } from "@brains/utils";

/**
 * Generates dynamic routes for entity types that have matching templates
 */
export class DynamicRouteGenerator {
  constructor(
    private readonly context: ServicePluginContext,
    private readonly routeRegistry: RouteRegistry,
    private readonly entityRouteConfig?: EntityRouteConfig,
  ) {}

  /**
   * Generate routes for all entity types that have matching list/detail templates
   */
  async generateEntityRoutes(): Promise<void> {
    const logger = this.context.logger.child("DynamicRouteGenerator");

    // STEP 1: Clear all previously generated dynamic routes
    // This prevents accumulation of routes for deleted entities
    const allRoutes = this.routeRegistry.list();
    let clearedCount = 0;
    for (const route of allRoutes) {
      if (route.sourceEntityType) {
        // Dynamic routes have this marker
        this.routeRegistry.unregister(route.path);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      logger.debug(
        `Cleared ${clearedCount} dynamic routes before regeneration`,
      );
    }

    // STEP 2: Regenerate routes from current entity state
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

    logger.debug(`Generating routes for entity type: ${entityType}`, {
      listTemplate: listTemplateName,
      detailTemplate: detailTemplateName,
    });

    // Register index route if we have a list template
    if (listTemplateName) {
      const { pluralName, label, paginate, pageSize, navigation } =
        this.getEntityDisplayConfig(entityType);

      if (paginate) {
        // Generate paginated routes
        await this.generatePaginatedRoutes(
          entityType,
          listTemplateName,
          pluralName,
          label,
          pageSize,
          navigation,
          logger,
        );
      } else {
        // Generate a single index route (original behavior)
        // Check list template for route layout preference
        const templates = this.context.views.list();
        const listTemplate = templates.find((t) => t.name === listTemplateName);
        const listLayout = listTemplate?.routeLayout ?? "default";

        const indexRoute: RouteDefinition = {
          id: `${entityType}-index`,
          path: `/${pluralName}`,
          title: label,
          description: `Browse all ${pluralName}`,
          layout: listLayout,
          navigation: {
            show: navigation.show,
            label,
            slot: navigation.slot,
            priority: navigation.priority,
          },
          sections: [
            {
              id: "list",
              template: listTemplateName,
              dataQuery: {
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
    }

    // Get all entities of this type and create detail routes if we have a detail template
    if (detailTemplateName) {
      try {
        const entities = await this.context.entityService.listEntities(
          entityType,
          { limit: 1000 }, // Get all entities for static generation
        );

        logger.debug(
          `Found ${entities.length} ${entityType} entities to generate routes for`,
        );

        // Get display config for entity type
        const { pluralName } = this.getEntityDisplayConfig(entityType);

        // Get template to check for route layout preference
        const templates = this.context.views.list();
        const detailTemplate = templates.find(
          (t) => t.name === detailTemplateName,
        );
        const layout = detailTemplate?.routeLayout ?? "default";

        for (const entity of entities) {
          // Use slug for URL if available (e.g., blog posts), otherwise use entity ID
          const urlSlug =
            "slug" in entity.metadata
              ? (entity.metadata["slug"] as string)
              : entity.id;

          const detailRoute: RouteDefinition = {
            id: `${entityType}-${entity.id}`,
            path: `/${pluralName}/${urlSlug}`,
            title: `${this.capitalize(entityType)}: ${urlSlug}`,
            description: `View ${entityType} details`,
            layout,
            sections: [
              {
                id: "detail",
                template: detailTemplateName,
                dataQuery: {
                  entityType,
                  query: { id: urlSlug }, // Pass slug for datasource lookup
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
        logger.debug(
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
   * Generate paginated list routes for an entity type
   */
  private async generatePaginatedRoutes(
    entityType: string,
    listTemplateName: string,
    pluralName: string,
    label: string,
    pageSize: number,
    navigation: { show: boolean; slot: NavigationSlot; priority: number },
    logger: ReturnType<typeof this.context.logger.child>,
  ): Promise<void> {
    // Get total entity count
    const entities = await this.context.entityService.listEntities(entityType, {
      limit: 1000,
    });
    const totalItems = entities.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    logger.debug(
      `Generating ${totalPages} paginated routes for ${entityType}`,
      {
        totalItems,
        pageSize,
      },
    );

    // Check list template for route layout preference
    const templates = this.context.views.list();
    const listTemplate = templates.find((t) => t.name === listTemplateName);
    const listLayout = listTemplate?.routeLayout ?? "default";

    // Generate route for each page
    for (let page = 1; page <= totalPages; page++) {
      const isFirstPage = page === 1;
      const path = isFirstPage
        ? `/${pluralName}`
        : `/${pluralName}/page/${page}`;

      const pageRoute: RouteDefinition = {
        id: `${entityType}-index${isFirstPage ? "" : `-page-${page}`}`,
        path,
        title: isFirstPage ? label : `${label} - Page ${page}`,
        description: `Browse all ${pluralName}${isFirstPage ? "" : ` - Page ${page}`}`,
        layout: listLayout,
        navigation: isFirstPage
          ? {
              show: navigation.show,
              label,
              slot: navigation.slot,
              priority: navigation.priority,
            }
          : undefined,
        sections: [
          {
            id: "list",
            template: listTemplateName,
            dataQuery: {
              entityType,
              query: {
                page,
                pageSize,
                baseUrl: `/${pluralName}`,
              },
            },
          },
        ],
        sourceEntityType: entityType,
      };

      try {
        this.routeRegistry.register(pageRoute);
        logger.debug(`Registered paginated route for ${entityType}`, {
          path: pageRoute.path,
          page,
        });
      } catch (error) {
        logger.warn(
          `Failed to register paginated route for ${entityType} page ${page}`,
          { error },
        );
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
    const allTemplates = this.context.views.list();

    // Look for templates matching the pattern [entityType]-list/detail
    // Must match exactly after namespace separator (":") to avoid
    // "social-post-list" matching entity type "post"
    let listTemplateName: string | undefined;
    let detailTemplateName: string | undefined;

    const listSuffix = `${entityType}-list`;
    const detailSuffix = `${entityType}-detail`;

    for (const template of allTemplates) {
      const templateName = template.name;

      // Check for list template - must be exact match after ":" or at start
      if (templateName.endsWith(listSuffix)) {
        const prefix = templateName.slice(0, -listSuffix.length);
        // Valid if no prefix, or prefix ends with ":" (namespace separator)
        if (prefix === "" || prefix.endsWith(":")) {
          listTemplateName = templateName;
        }
      }

      // Check for detail template - must be exact match after ":" or at start
      if (templateName.endsWith(detailSuffix)) {
        const prefix = templateName.slice(0, -detailSuffix.length);
        // Valid if no prefix, or prefix ends with ":" (namespace separator)
        if (prefix === "" || prefix.endsWith(":")) {
          detailTemplateName = templateName;
        }
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
   * Get display configuration for an entity type
   * Checks custom config first, falls back to auto-generation
   * Pagination is enabled by default for all entity types with list templates
   */
  private getEntityDisplayConfig(entityType: string): {
    pluralName: string;
    label: string;
    paginate: boolean;
    pageSize: number;
    navigation: {
      show: boolean;
      slot: NavigationSlot;
      priority: number;
    };
  } {
    const config = this.entityRouteConfig?.[entityType];
    const DEFAULT_PAGE_SIZE = 10;
    const DEFAULT_PAGINATE = true; // Enable pagination by default
    const DEFAULT_NAV_SHOW = true;
    const DEFAULT_NAV_SLOT: NavigationSlot = "primary";
    const DEFAULT_NAV_PRIORITY = 40;

    if (config) {
      // Use custom config
      // pluralName is for URL paths (uses explicit value or pluralized label)
      // displayLabel is for navigation (always derived from label, properly pluralized)
      const pluralName =
        config.pluralName ?? pluralize(config.label.toLowerCase());
      const displayLabel = this.capitalize(
        pluralize(config.label.toLowerCase()),
      );
      return {
        pluralName,
        label: displayLabel,
        paginate: config.paginate ?? DEFAULT_PAGINATE,
        pageSize: config.pageSize ?? DEFAULT_PAGE_SIZE,
        navigation: {
          show: config.navigation?.show ?? DEFAULT_NAV_SHOW,
          slot: config.navigation?.slot ?? DEFAULT_NAV_SLOT,
          priority: config.navigation?.priority ?? DEFAULT_NAV_PRIORITY,
        },
      };
    }

    // Fall back to auto-generation with pagination enabled
    const pluralName = pluralize(entityType);
    return {
      pluralName,
      label: this.capitalize(pluralName),
      paginate: DEFAULT_PAGINATE,
      pageSize: DEFAULT_PAGE_SIZE,
      navigation: {
        show: DEFAULT_NAV_SHOW,
        slot: DEFAULT_NAV_SLOT,
        priority: DEFAULT_NAV_PRIORITY,
      },
    };
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
