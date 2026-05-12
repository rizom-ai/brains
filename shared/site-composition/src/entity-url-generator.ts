import { pluralize } from "@brains/utils";

/**
 * Display metadata per entity type used for URL generation.
 * Maps entity types to custom labels and plural names.
 */
export interface EntityDisplayMap {
  [entityType: string]: {
    label: string;
    pluralName?: string;
  };
}

/**
 * Generates URLs for entity detail pages based on entity display metadata.
 * Singleton pattern - configured once by site-builder, used by all plugins.
 */
export class EntityUrlGenerator {
  private static instance: EntityUrlGenerator | null = null;
  private entityDisplay: EntityDisplayMap | undefined;

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
  configure(entityDisplay?: EntityDisplayMap): void {
    this.entityDisplay = entityDisplay;
  }

  /**
   * Reset the instance (for testing)
   */
  static resetInstance(): void {
    EntityUrlGenerator.instance = null;
  }

  /**
   * Check if an entity type has a configured display entry (is linkable).
   * @param entityType The entity type to check
   * @returns true if the entity type has an explicit display entry
   */
  hasRoute(entityType: string): boolean {
    return this.entityDisplay?.[entityType] !== undefined;
  }

  /**
   * Generate URL for an entity detail page
   * @param entityType The entity type (e.g., 'post', 'deck')
   * @param slug The entity slug or ID
   * @returns The URL path (e.g., '/essays/my-post' or '/posts/my-post')
   */
  generateUrl(entityType: string, slug: string): string {
    const config = this.entityDisplay?.[entityType];

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
