import type {
  BaseEntity,
  EntityAdapter,
  EntityInput,
  IdentityBody,
  ProfileBody,
} from "@brains/plugins";

/**
 * Metadata interface for entities that support cover images.
 * Entities with supportsCoverImage=true on their adapter have this shape.
 */
export interface CoverImageMetadata extends Record<string, unknown> {
  title: string;
  coverImageId?: string | null;
}

/**
 * Entity that supports cover images
 */
export type EntityWithCoverImage = BaseEntity<CoverImageMetadata>;

/**
 * Image plugin interface for tools
 * Provides the minimal interface needed by image tools
 */
export interface IImagePlugin {
  /**
   * Get entity by type and ID
   */
  getEntity(entityType: string, id: string): Promise<BaseEntity | null>;

  /**
   * Find entity by ID, slug, or title
   */
  findEntity(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null>;

  /**
   * Create a new entity
   */
  createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
  ): Promise<{ entityId: string; jobId: string }>;

  /**
   * Update an existing entity
   */
  updateEntity<T extends BaseEntity>(
    entity: T,
  ): Promise<{ entityId: string; jobId: string }>;

  /**
   * Get adapter for an entity type (to check capabilities)
   */
  getAdapter<T extends BaseEntity>(
    entityType: string,
  ): EntityAdapter<T> | undefined;

  /**
   * Check if image generation is available
   */
  canGenerateImages(): boolean;

  /**
   * Get the brain's identity data
   */
  getIdentityData(): IdentityBody;

  /**
   * Get the owner's profile data
   */
  getProfileData(): ProfileBody;
}

/**
 * Image plugin configuration
 */
export interface ImageConfig {
  /**
   * Default aspect ratio for generated images
   */
  defaultAspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}
