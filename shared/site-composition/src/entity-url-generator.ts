import { pluralize } from "@brains/utils/string-utils";

/**
 * Display metadata per entity type used for URL generation.
 * Maps entity types to custom labels and plural names.
 */
export interface EntityDisplayMap {
  [entityType: string]: {
    label: string;
    pluralName?: string | undefined;
    /** A piece of work a visitor's answer may cite as a source. */
    citable?: boolean | undefined;
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
   * Whether a visitor's answer may cite this type as a source: a type the
   * site marks citable, or, on a site that marks none, any type with pages.
   */
  isCitable(entityType: string): boolean {
    const entries = Object.values(this.entityDisplay ?? {});
    if (!entries.some((entry) => entry.citable === true)) {
      return this.hasRoute(entityType);
    }
    return this.entityDisplay?.[entityType]?.citable === true;
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
