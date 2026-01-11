import { ServicePlugin } from "@brains/plugins";
import type {
  PluginTool,
  BaseEntity,
  EntityInput,
  EntityAdapter,
  IdentityBody,
  ProfileBody,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { createImageTools } from "./tools";
import type { IImagePlugin, ImageConfig } from "./types";
import packageJson from "../package.json";

/**
 * Schema for image plugin configuration
 */
const imageConfigSchema = z.object({
  defaultStyle: z
    .enum(["vivid", "natural"])
    .default("vivid")
    .describe("Default style for generated images"),
  defaultSize: z
    .enum(["1024x1024", "1792x1024", "1024x1792"])
    .default("1792x1024")
    .describe("Default size for generated images"),
});

/**
 * Image Plugin - Provides image management and AI generation tools
 *
 * This plugin provides tools for:
 * - Uploading images from URLs or data URLs
 * - Retrieving and listing images
 * - Generating images with DALL-E 3
 * - Setting cover images on entities
 */
export class ImagePlugin
  extends ServicePlugin<ImageConfig>
  implements IImagePlugin
{
  declare protected config: ImageConfig;

  constructor(config: Partial<ImageConfig> = {}) {
    super("image", packageJson, config, imageConfigSchema);
  }

  /**
   * Get the current configuration
   */
  public getConfig(): ImageConfig {
    return this.config;
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return createImageTools(this, this.id);
  }

  // ============================================================================
  // IImagePlugin implementation
  // ============================================================================

  /**
   * Get entity by type and ID
   */
  public async getEntity(
    entityType: string,
    id: string,
  ): Promise<BaseEntity | null> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    try {
      return await this.context.entityService.getEntity(entityType, id);
    } catch {
      return null;
    }
  }

  /**
   * Find entity by ID, slug, or title
   */
  public async findEntity(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }

    try {
      // Try direct ID lookup first
      const byId = await this.context.entityService.getEntity(
        entityType,
        identifier,
      );
      if (byId) return byId;

      // Try by slug
      const bySlug = await this.context.entityService.listEntities(entityType, {
        limit: 1,
        filter: { metadata: { slug: identifier } },
      });
      if (bySlug[0]) return bySlug[0];

      // Try by title
      const byTitle = await this.context.entityService.listEntities(
        entityType,
        {
          limit: 1,
          filter: { metadata: { title: identifier } },
        },
      );
      if (byTitle[0]) return byTitle[0];

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Create a new entity
   */
  public async createEntity<T extends BaseEntity>(
    entity: EntityInput<T>,
  ): Promise<{ entityId: string; jobId: string }> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.entityService.createEntity(entity);
  }

  /**
   * Update an existing entity
   */
  public async updateEntity<T extends BaseEntity>(
    entity: T,
  ): Promise<{ entityId: string; jobId: string }> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.updateEntity(entity);
  }

  /**
   * Get adapter for an entity type (to check capabilities)
   */
  public getAdapter<T extends BaseEntity>(
    entityType: string,
  ): EntityAdapter<T> | undefined {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.getAdapter<T>(entityType);
  }

  /**
   * Generate an image from a text prompt using DALL-E 3
   */
  public async generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.generateImage(prompt, options);
  }

  /**
   * Check if image generation is available
   */
  public canGenerateImages(): boolean {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.canGenerateImages();
  }

  /**
   * Get the brain's identity data
   */
  public getIdentityData(): IdentityBody {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.getIdentity();
  }

  /**
   * Get the owner's profile data
   */
  public getProfileData(): ProfileBody {
    if (!this.context) {
      throw new Error("Plugin not registered");
    }
    return this.context.getProfile();
  }
}
