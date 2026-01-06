import type { IEntityService, Logger } from "@brains/plugins";

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
  /** The content with references replaced by data URLs */
  content: string;
  /** Number of successfully resolved images */
  resolvedCount: number;
  /** Number of failed resolutions */
  failedCount: number;
}

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
 * At render time, replaces entity:// URLs with actual data URLs
 * by fetching the image entities from the database
 */
export class ImageReferenceResolver {
  private logger: Logger;

  constructor(
    private entityService: IEntityService,
    logger: Logger,
  ) {
    this.logger = logger.child("ImageReferenceResolver");
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
   * Resolve all entity://image references to data URLs
   *
   * @param content The markdown content to process
   * @returns Result with updated content and counts
   */
  async resolve(content: string): Promise<ResolveResult> {
    const references = this.detectReferences(content);

    if (references.length === 0) {
      return { content, resolvedCount: 0, failedCount: 0 };
    }

    // Collect unique image IDs for batch fetching
    const uniqueIds = [...new Set(references.map((ref) => ref.imageId))];

    // Fetch all images (batch)
    const imageMap = new Map<string, string>();
    for (const imageId of uniqueIds) {
      try {
        const image = await this.entityService.getEntity("image", imageId);
        if (image?.content) {
          imageMap.set(imageId, image.content);
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

    // Replace references with data URLs
    let modifiedContent = content;
    let resolvedCount = 0;
    let failedCount = 0;

    for (const ref of references) {
      const dataUrl = imageMap.get(ref.imageId);
      if (dataUrl) {
        const replacement = `![${ref.alt}](${dataUrl})`;
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
}
