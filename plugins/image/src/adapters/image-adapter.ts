import type { EntityAdapter } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  imageSchema,
  type Image,
  type ImageMetadata,
  type ImageFormat,
} from "../schemas/image";
import {
  parseDataUrl,
  detectImageDimensions,
  detectImageFormat,
} from "../lib/image-utils";

/**
 * Input for creating an image entity
 */
export interface CreateImageInput {
  dataUrl: string;
  title: string;
  alt?: string;
}

/**
 * Entity adapter for image entities
 * Images store base64 data URLs in content field (not markdown)
 */
export class ImageAdapter implements EntityAdapter<Image, ImageMetadata> {
  public readonly entityType = "image" as const;
  public readonly schema = imageSchema;

  /**
   * Convert image entity to "markdown" (actually just the data URL)
   * Images don't have frontmatter - content is the raw data URL
   */
  public toMarkdown(entity: Image): string {
    return entity.content;
  }

  /**
   * Parse "markdown" (data URL) to create partial image entity
   * Auto-detects format and dimensions from the image data
   */
  public fromMarkdown(content: string): Partial<Image> {
    const { format, base64 } = parseDataUrl(content);
    const dimensions = detectImageDimensions(base64);

    // Generate a default title
    const title = `Untitled ${format.toUpperCase()} image`;

    return {
      entityType: "image",
      content,
      metadata: {
        title,
        alt: title,
        format: format as ImageFormat,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
      },
    };
  }

  /**
   * Extract metadata from image entity
   */
  public extractMetadata(entity: Image): ImageMetadata {
    return entity.metadata;
  }

  /**
   * Parse frontmatter from content - images don't have frontmatter
   * Returns empty object for any schema
   */
  public parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // Images don't have frontmatter, return empty object parsed through schema
    // This will throw if the schema requires fields
    return schema.parse({});
  }

  /**
   * Generate frontmatter for image entity - images don't use frontmatter
   */
  public generateFrontMatter(_entity: Image): string {
    // Images don't have frontmatter
    return "";
  }

  /**
   * Create image entity data from input
   * Auto-detects format and dimensions from the data URL
   * Returns fields needed for entity creation (id, created, updated, contentHash are auto-generated)
   */
  public createImageEntity(
    input: CreateImageInput,
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    const { dataUrl, title, alt } = input;
    const { format, base64 } = parseDataUrl(dataUrl);
    const dimensions = detectImageDimensions(base64);

    // Try to detect format from magic bytes if header doesn't match
    const detectedFormat = detectImageFormat(base64);
    const finalFormat = (detectedFormat ?? format) as ImageFormat;

    return {
      entityType: "image",
      content: dataUrl,
      metadata: {
        title,
        alt: alt ?? title,
        format: finalFormat,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
      },
    };
  }
}

// Create default instance
export const imageAdapter = new ImageAdapter();
