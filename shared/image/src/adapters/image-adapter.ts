import type { EntityAdapter } from "@brains/entity-service";
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
 * Entity adapter for image entities.
 *
 * Images store base64 data URLs in content field — NOT markdown.
 * They have no frontmatter, no structured body, and no template.
 * This adapter implements EntityAdapter directly (not BaseEntityAdapter)
 * because images are fundamentally non-textual entities.
 */
export class ImageAdapter implements EntityAdapter<Image, ImageMetadata> {
  public readonly entityType = "image" as const;
  public readonly schema = imageSchema;

  public toMarkdown(entity: Image): string {
    return entity.content;
  }

  public fromMarkdown(content: string): Partial<Image> {
    const { format, base64 } = parseDataUrl(content);
    const dimensions = detectImageDimensions(base64);

    return {
      entityType: "image",
      content,
      metadata: {
        format: format as ImageFormat,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
      },
    };
  }

  public extractMetadata(entity: Image): ImageMetadata {
    return entity.metadata;
  }

  public parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return schema.parse({});
  }

  public generateFrontMatter(_entity: Image): string {
    return "";
  }

  public getBodyTemplate(): string {
    return "";
  }

  /**
   * Create image entity data from input.
   * Auto-detects format and dimensions from the data URL.
   */
  public createImageEntity(
    input: CreateImageInput,
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    const { dataUrl, title, alt } = input;
    const { format, base64 } = parseDataUrl(dataUrl);
    const dimensions = detectImageDimensions(base64);

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

export const imageAdapter = new ImageAdapter();
