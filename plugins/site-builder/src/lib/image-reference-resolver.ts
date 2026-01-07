import type { IEntityService, Logger } from "@brains/plugins";

/**
 * Map of image ID to URL (static path or data URL)
 */
export interface ImageMap {
  [imageId: string]: string;
}

/**
 * Detected entity:// image reference in markdown
 */
export interface ImageReference {
  /** The image entity ID */
  imageId: string;
  /** The alt text from the markdown */
  alt: string;
  /** The original markdown syntax */
  originalMarkdown: string;
}

/**
 * Result of resolving image references
 */
export interface ResolveResult {
  /** The content with references replaced by URLs */
  content: string;
  /** Number of successfully resolved images */
  resolvedCount: number;
  /** Number of failed resolutions */
  failedCount: number;
}

/**
 * Resolution mode configuration
 */
type ResolutionMode =
  | { mode: "inline"; entityService: IEntityService }
  | { mode: "static"; imageMap: ImageMap };

/**
 * Regex to match entity:// image references in markdown
 * Matches: ![alt](entity://image/id)
 * Captures:
 * - Group 1: alt text
 * - Group 2: image ID
 */
const ENTITY_IMAGE_REGEX = /!\[([^\]]*)\]\(entity:\/\/image\/([^)]+)\)/g;

/**
 * Resolves entity://image/{id} references in markdown content
 *
 * Supports two modes:
 * - inline: Fetches image entities and replaces with data URLs (dev/preview)
 * - static: Uses pre-built imageMap to replace with static file URLs (production)
 *
 * This is a BUILD-TIME concern owned by site-builder, not individual plugins.
 */
export class ImageReferenceResolver {
  private logger: Logger;

  private constructor(
    private resolution: ResolutionMode,
    logger: Logger,
  ) {
    this.logger = logger.child("ImageReferenceResolver");
  }

  /**
   * Create resolver in inline mode (fetches entities, returns data URLs)
   * Use for development or when images should be embedded inline.
   */
  static inline(
    entityService: IEntityService,
    logger: Logger,
  ): ImageReferenceResolver {
    return new ImageReferenceResolver(
      { mode: "inline", entityService },
      logger,
    );
  }

  /**
   * Create resolver in static mode (uses pre-built imageMap)
   * Use for production builds with extracted static image files.
   */
  static static(imageMap: ImageMap, logger: Logger): ImageReferenceResolver {
    return new ImageReferenceResolver({ mode: "static", imageMap }, logger);
  }

  /**
   * Detect all entity://image references in content
   *
   * @param content The markdown content to scan
   * @returns Array of detected image references
   */
  detectReferences(content: string): ImageReference[] {
    const references: ImageReference[] = [];
    const regex = new RegExp(ENTITY_IMAGE_REGEX.source, "g");

    let match;
    while ((match = regex.exec(content)) !== null) {
      references.push({
        alt: match[1] ?? "",
        imageId: match[2] ?? "",
        originalMarkdown: match[0],
      });
    }

    return references;
  }

  /**
   * Resolve all entity://image references to URLs
   *
   * @param content The markdown content to process
   * @returns Result with updated content and counts
   */
  async resolve(content: string): Promise<ResolveResult> {
    const references = this.detectReferences(content);

    if (references.length === 0) {
      return { content, resolvedCount: 0, failedCount: 0 };
    }

    // Build URL map based on resolution mode
    const urlMap = await this.buildUrlMap(references);

    // Replace references with URLs
    let modifiedContent = content;
    let resolvedCount = 0;
    let failedCount = 0;

    for (const ref of references) {
      const url = urlMap.get(ref.imageId);
      if (url) {
        const replacement = `![${ref.alt}](${url})`;
        modifiedContent = modifiedContent.replace(
          ref.originalMarkdown,
          replacement,
        );
        resolvedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      content: modifiedContent,
      resolvedCount,
      failedCount,
    };
  }

  /**
   * Build URL map based on resolution mode
   */
  private async buildUrlMap(
    references: ImageReference[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(references.map((ref) => ref.imageId))];

    if (this.resolution.mode === "static") {
      // Static mode: look up URLs from pre-built imageMap
      const urlMap = new Map<string, string>();
      for (const imageId of uniqueIds) {
        const url = this.resolution.imageMap[imageId];
        if (url) {
          urlMap.set(imageId, url);
        } else {
          this.logger.warn("Image not found in imageMap", { imageId });
        }
      }
      return urlMap;
    }

    // Inline mode: fetch from entity service
    const urlMap = new Map<string, string>();
    for (const imageId of uniqueIds) {
      try {
        const image = await this.resolution.entityService.getEntity(
          "image",
          imageId,
        );
        if (image?.content) {
          urlMap.set(imageId, image.content);
        } else {
          this.logger.warn("Image entity not found", { imageId });
        }
      } catch (error) {
        this.logger.warn("Failed to fetch image entity", {
          imageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return urlMap;
  }
}
