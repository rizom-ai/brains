import type { EntityRouteConfig } from "../config";
import { pluralize } from "@brains/utils";

/**
 * Generates URLs for entity detail pages based on entity route config
 * Singleton pattern - configured once by site-builder, used by all datasources
 */
export class EntityUrlGenerator {
  private static instance: EntityUrlGenerator | null = null;
  private entityRouteConfig: EntityRouteConfig | undefined;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): EntityUrlGenerator {
    EntityUrlGenerator.instance ??= new EntityUrlGenerator();
    return EntityUrlGenerator.instance;
  }

  /**
   * Configure the URL generator (called by site-builder plugin)
   */
  configure(entityRouteConfig?: EntityRouteConfig): void {
    this.entityRouteConfig = entityRouteConfig;
  }

  /**
   * Reset the instance (for testing)
   */
  static resetInstance(): void {
    EntityUrlGenerator.instance = null;
  }

  /**
   * Generate URL for an entity detail page
   * @param entityType The entity type (e.g., 'post', 'deck')
   * @param slug The entity slug or ID
   * @returns The URL path (e.g., '/essays/my-post' or '/posts/my-post')
   */
  generateUrl(entityType: string, slug: string): string {
    const config = this.entityRouteConfig?.[entityType];

    if (config) {
      // Use custom config
      const pluralName = config.pluralName ?? config.label.toLowerCase() + "s";
      return `/${pluralName}/${slug}`;
    }

    // Fall back to auto-generated pluralization
    const pluralName = pluralize(entityType);
    return `/${pluralName}/${slug}`;
  }
}
