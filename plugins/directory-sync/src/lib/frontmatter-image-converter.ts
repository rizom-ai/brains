import type { IEntityService, Logger } from "@brains/plugins";
import { isHttpUrl, fetchImageAsBase64, slugify } from "@brains/utils";
import matter from "gray-matter";

/**
 * Result of image URL conversion
 */
export interface ConversionResult {
  /** The (potentially modified) content */
  content: string;
  /** Whether any conversion was performed */
  converted: boolean;
  /** The image entity ID if created or found */
  imageId?: string;
}

/**
 * Frontmatter with optional coverImage fields
 */
interface CoverImageFrontmatter {
  coverImage?: string;
  coverImageId?: string;
}

/** Function to fetch an image URL and return base64 data URL */
export type ImageFetcher = (url: string) => Promise<string>;

/**
 * Converts coverImage URLs in frontmatter to coverImageId references
 *
 * When a markdown file has `coverImage: https://...` in frontmatter:
 * 1. Fetches the image from the URL
 * 2. Creates an image entity (or reuses existing by sourceUrl)
 * 3. Replaces coverImage with coverImageId in the frontmatter
 */
export class FrontmatterImageConverter {
  private logger: Logger;

  constructor(
    private entityService: IEntityService,
    logger: Logger,
    private fetcher: ImageFetcher = fetchImageAsBase64,
  ) {
    this.logger = logger.child("FrontmatterImageConverter");
  }

  /**
   * Convert coverImage URL to coverImageId in frontmatter
   * Works on any markdown content with a coverImage HTTP URL
   */
  async convert(content: string): Promise<ConversionResult> {
    // Parse frontmatter
    let parsed;
    try {
      parsed = matter(content);
    } catch (e) {
      this.logger.debug("Parse failed", { error: e });
      return { content, converted: false };
    }

    const frontmatter = parsed.data as CoverImageFrontmatter;

    // Skip if already converted
    if (frontmatter.coverImageId) {
      return { content, converted: false };
    }

    // Skip if no coverImage or not an HTTP URL
    const coverImage = frontmatter.coverImage;
    if (!coverImage || !isHttpUrl(coverImage)) {
      return { content, converted: false };
    }

    // Convert the image URL
    try {
      const imageId = await this.getOrCreateImageEntity(coverImage);

      // Clone frontmatter to avoid mutating gray-matter's cache
      const newFrontmatter = { ...frontmatter };
      delete newFrontmatter.coverImage;
      newFrontmatter.coverImageId = imageId;

      return {
        content: matter.stringify(parsed.content, newFrontmatter),
        converted: true,
        imageId,
      };
    } catch (error) {
      this.logger.warn("Failed to convert coverImage URL", {
        url: coverImage,
        error: error instanceof Error ? error.message : String(error),
      });
      return { content, converted: false };
    }
  }

  /**
   * Get existing image entity by sourceUrl or create new one
   */
  private async getOrCreateImageEntity(sourceUrl: string): Promise<string> {
    // Check for existing image with this sourceUrl (deduplication)
    const existing = await this.entityService.listEntities("image", {
      filter: { metadata: { sourceUrl } },
      limit: 1,
    });

    if (existing[0]) {
      this.logger.debug("Reusing existing image entity", {
        sourceUrl,
        imageId: existing[0].id,
      });
      return existing[0].id;
    }

    // Fetch the image and create new entity
    const dataUrl = await this.fetcher(sourceUrl);

    // Generate ID from URL (use last path segment)
    const filename = new URL(sourceUrl).pathname.split("/").pop() ?? "image";
    const baseId = slugify(filename.replace(/\.[^.]+$/, ""));

    const result = await this.entityService.createEntity({
      id: baseId,
      entityType: "image",
      content: dataUrl,
      metadata: {
        title: baseId,
        alt: baseId,
        sourceUrl,
      },
    });

    this.logger.debug("Created image entity from URL", {
      sourceUrl,
      imageId: result.entityId,
    });

    return result.entityId;
  }
}
