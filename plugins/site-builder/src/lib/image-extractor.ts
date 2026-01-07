import type { IEntityService, Logger } from "@brains/plugins";
import { promises as fs } from "fs";
import { join } from "path";

// Image entity type (inline to avoid @brains/image dependency during investigation)
interface ImageEntity {
  id: string;
  entityType: string;
  content: string;
  metadata: {
    format?: string;
  };
  created: string;
  updated: string;
  contentHash: string;
}

/**
 * Map of image ID to static URL path
 */
export interface ImageMap {
  [imageId: string]: string;
}

/**
 * Regex to match entity://image references in markdown
 * Captures the image ID from: ![alt](entity://image/id)
 */
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(entity:\/\/image\/([^)]+)\)/g;

/**
 * Regex to match entity://image references in HTML img src attributes
 * Captures the image ID from: src="entity://image/id" or src='entity://image/id'
 */
const HTML_IMG_SRC_REGEX = /src=["']entity:\/\/image\/([^"']+)["']/g;

/**
 * Extracts image entities to static files during build
 *
 * Scans content for entity://image references, fetches the image entities,
 * writes them to disk as static files, and returns a map of ID → URL.
 */
export class ImageExtractor {
  private logger: Logger;

  constructor(
    private outputDir: string,
    private entityService: IEntityService,
    logger: Logger,
  ) {
    this.logger = logger.child("ImageExtractor");
  }

  /**
   * Detect all unique entity://image IDs in content
   * Handles both markdown ![alt](entity://image/id) and HTML <img src="entity://image/id">
   *
   * @param content The markdown/HTML content to scan
   * @returns Array of unique image IDs
   */
  detectImageReferences(content: string): string[] {
    const ids = new Set<string>();

    // Match markdown format: ![alt](entity://image/id)
    const markdownRegex = new RegExp(MARKDOWN_IMAGE_REGEX.source, "g");
    let match;
    while ((match = markdownRegex.exec(content)) !== null) {
      if (match[1]) {
        ids.add(match[1]);
      }
    }

    // Match HTML format: src="entity://image/id" or src='entity://image/id'
    const htmlRegex = new RegExp(HTML_IMG_SRC_REGEX.source, "g");
    while ((match = htmlRegex.exec(content)) !== null) {
      if (match[1]) {
        ids.add(match[1]);
      }
    }

    return [...ids];
  }

  /**
   * Extract images from content to static files
   *
   * @param contents Array of markdown content strings to scan
   * @returns Map of imageId → static URL path
   */
  async extractFromContent(contents: string[]): Promise<ImageMap> {
    // Collect all unique image IDs from all content
    const allIds = new Set<string>();
    for (const content of contents) {
      const ids = this.detectImageReferences(content);
      for (const id of ids) {
        allIds.add(id);
      }
    }

    if (allIds.size === 0) {
      return {};
    }

    // Create images directory
    const imagesDir = join(this.outputDir, "images");
    await fs.mkdir(imagesDir, { recursive: true });

    // Fetch and extract each image
    const imageMap: ImageMap = {};

    for (const imageId of allIds) {
      try {
        const image = await this.entityService.getEntity<ImageEntity>(
          "image",
          imageId,
        );

        if (!image?.content) {
          this.logger.warn("Image entity not found or has no content", {
            imageId,
          });
          continue;
        }

        // Determine format from metadata or data URL
        const format = this.detectFormat(image.metadata, image.content);

        // Extract base64 data and write to file
        const base64Data = this.extractBase64(image.content);
        if (!base64Data) {
          this.logger.warn("Could not extract base64 data from image", {
            imageId,
          });
          continue;
        }

        const fileName = `${imageId}.${format}`;
        const filePath = join(imagesDir, fileName);
        const buffer = Buffer.from(base64Data, "base64");

        await fs.writeFile(filePath, buffer);

        // Add to map with static URL
        imageMap[imageId] = `/images/${fileName}`;

        this.logger.debug("Extracted image to static file", {
          imageId,
          path: `/images/${fileName}`,
        });
      } catch (error) {
        this.logger.warn("Failed to extract image", {
          imageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return imageMap;
  }

  /**
   * Detect image format from metadata or data URL
   */
  private detectFormat(
    metadata: ImageEntity["metadata"],
    dataUrl: string,
  ): string {
    // Try metadata first (ImageMetadata has typed format field)
    if (metadata.format) {
      return metadata.format;
    }

    // Parse from data URL: data:image/png;base64,...
    const match = dataUrl.match(/^data:image\/([^;]+);/);
    if (match?.[1]) {
      return match[1];
    }

    // Default to png
    return "png";
  }

  /**
   * Extract base64 data from data URL
   */
  private extractBase64(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    return match?.[1] ?? null;
  }
}
