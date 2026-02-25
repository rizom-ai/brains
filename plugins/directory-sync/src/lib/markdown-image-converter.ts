import type { IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  getErrorMessage,
  isHttpUrl,
  fetchImageAsBase64,
  extractMarkdownImages,
  type ExtractedImage,
} from "@brains/utils";
import type { ImageFetcher } from "./frontmatter-image-converter";
import { getOrCreateImageEntity } from "./image-entity-helper";

/**
 * Detection info for a single inline image
 */
export interface InlineImageDetection {
  /** The source URL of the image */
  sourceUrl: string;
  /** The alt text from the markdown */
  alt: string;
  /** The original markdown syntax including alt and URL */
  originalMarkdown: string;
  /** The post slug for generating image IDs */
  postSlug: string;
}

/**
 * Result of inline image conversion
 */
export interface InlineConversionResult {
  /** The (potentially modified) content */
  content: string;
  /** Whether any conversion was performed */
  converted: boolean;
  /** Number of images converted */
  convertedCount: number;
}

/**
 * Converts inline markdown image URLs to entity:// references
 *
 * When markdown content has `![alt](https://...)`:
 * 1. Detects all HTTP image URLs in the body (not in code blocks)
 * 2. Fetches each image from its URL
 * 3. Creates image entities (or reuses existing by sourceUrl)
 * 4. Replaces URLs with entity://image/{id} references
 */
export class MarkdownImageConverter {
  private logger: Logger;

  constructor(
    private entityService: IEntityService,
    logger: Logger,
    private fetcher: ImageFetcher = fetchImageAsBase64,
  ) {
    this.logger = logger.child("MarkdownImageConverter");
  }

  /**
   * Detect all inline images that need conversion
   * Uses AST parsing via remark for robust detection
   *
   * @param content The markdown content to scan
   * @param postSlug The slug of the post (for generating image IDs)
   * @returns Array of detected images needing conversion
   */
  detectInlineImages(
    content: string,
    postSlug: string,
  ): InlineImageDetection[] {
    const detections: InlineImageDetection[] = [];

    // Use AST-based extraction (automatically excludes code blocks)
    const images = extractMarkdownImages(content);

    for (const image of images) {
      // Skip non-HTTP URLs
      if (!isHttpUrl(image.url)) {
        continue;
      }

      // Skip already converted entity:// references
      if (image.url.startsWith("entity://")) {
        continue;
      }

      // Reconstruct the original markdown for replacement
      const originalMarkdown = this.reconstructMarkdown(image);

      detections.push({
        sourceUrl: image.url,
        alt: image.alt,
        originalMarkdown,
        postSlug,
      });
    }

    return detections;
  }

  /**
   * Reconstruct the original markdown syntax from extracted image
   */
  private reconstructMarkdown(image: ExtractedImage): string {
    if (image.title) {
      return `![${image.alt}](${image.url} "${image.title}")`;
    }
    return `![${image.alt}](${image.url})`;
  }

  /**
   * Convert all inline image URLs to entity references
   *
   * @param content The markdown content to convert
   * @param postSlug The slug of the post (for generating image IDs)
   * @returns Conversion result with updated content
   */
  async convert(
    content: string,
    postSlug: string,
  ): Promise<InlineConversionResult> {
    const detections = this.detectInlineImages(content, postSlug);

    if (detections.length === 0) {
      return { content, converted: false, convertedCount: 0 };
    }

    let modifiedContent = content;
    let convertedCount = 0;
    let imageIndex = 0;

    for (const detection of detections) {
      try {
        const imageId = await this.createImageEntity(detection, imageIndex++);

        // Replace the original markdown with entity reference
        // Preserve the alt text
        const entityReference = `![${detection.alt}](entity://image/${imageId})`;
        modifiedContent = modifiedContent.replace(
          detection.originalMarkdown,
          entityReference,
        );
        convertedCount++;

        this.logger.debug("Converted inline image", {
          sourceUrl: detection.sourceUrl,
          imageId,
        });
      } catch (error) {
        this.logger.warn("Failed to convert inline image", {
          sourceUrl: detection.sourceUrl,
          error: getErrorMessage(error),
        });
        // Continue with other images - don't fail entire conversion
      }
    }

    return {
      content: modifiedContent,
      converted: convertedCount > 0,
      convertedCount,
    };
  }

  private async createImageEntity(
    detection: InlineImageDetection,
    index: number,
  ): Promise<string> {
    const { sourceUrl, alt, postSlug } = detection;
    return getOrCreateImageEntity(
      {
        id: `${postSlug}-inline-${index}`,
        title: alt || `Inline image ${index + 1} for ${postSlug}`,
        alt: alt || "",
        sourceUrl,
      },
      this.entityService,
      this.fetcher,
      this.logger,
    );
  }
}
