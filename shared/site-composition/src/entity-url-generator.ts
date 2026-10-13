import { pluralize } from "@brains/utils/string-utils";

/**
 * Display metadata per entity type used for URL generation.
 * Maps entity types to custom labels and plural names.
 */
export interface EntityDisplayMap {
  [entityType: string]: {
    label: string;
    pluralName?: string | undefined;
    /** A source candidate; false always excludes it from answer citations. */
    citable?: boolean | undefined;
  };
}

/**
 * Entity detail URLs and citability, read from one site's entity display.
 * A plain value over the display the shell resolves: every reader builds its
 * own from that same map, so there is no shared state to configure.
 */
export class EntityUrlGenerator {
  private readonly entityDisplay: EntityDisplayMap | undefined;

  constructor(entityDisplay?: EntityDisplayMap) {
    this.entityDisplay = entityDisplay;
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
   * site marks citable, or, when none opt in, any type with pages that is not
   * explicitly excluded. False always excludes; it does not remove the page.
   */
  isCitable(entityType: string): boolean {
    if (this.entityDisplay?.[entityType]?.citable === false) return false;
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
