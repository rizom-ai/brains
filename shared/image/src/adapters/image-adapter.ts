import type { EntityAdapter, EntitySchema } from "@brains/entity-service";
import {
  imageSchema,
  type Image,
  type ImageMetadata,
  type ImageFormat,
  type ImageIngestionStatus,
} from "../schemas/image";
import {
  parseDataUrl,
  detectImageDimensions,
  detectImageFormat,
  toImageFormat,
} from "../lib/image-utils";

/**
 * The media subtype of an image data URL, validated against the supported
 * formats. Throws rather than asserting: a `data:image/bmp;...` URL is a real
 * input this package does not support, and storing it as an ImageFormat would
 * put a value in entity metadata that its own schema rejects.
 */
function requireImageFormat(mediaSubtype: string): ImageFormat {
  const format = toImageFormat(mediaSubtype);
  if (!format) {
    throw new Error(`Unsupported image format: ${mediaSubtype}`);
  }
  return format;
}

/**
 * Input for creating an image entity
 */
export interface CreateImageInput {
  dataUrl: string;
  title: string;
  alt?: string;
  status?: ImageIngestionStatus;
  sourceUrl?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceUploadId?: string;
  sourceFilename?: string;
  sourceMediaType?: string;
  attachmentType?: string;
  dedupKey?: string;
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
  public readonly purpose =
    "Image assets such as generated covers, social previews, and uploaded images.";
  public readonly schema: EntitySchema<Image> = imageSchema;

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
        format: requireImageFormat(format),
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
    schema: { parse(data: unknown): TFrontmatter },
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
    const finalFormat = detectedFormat ?? requireImageFormat(format);

    return {
      entityType: "image",
      content: dataUrl,
      metadata: {
        title,
        alt: alt ?? title,
        format: finalFormat,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
        ...(input.status && { status: input.status }),
        ...(input.sourceUrl && { sourceUrl: input.sourceUrl }),
        ...(input.sourceEntityType && {
          sourceEntityType: input.sourceEntityType,
        }),
        ...(input.sourceEntityId && { sourceEntityId: input.sourceEntityId }),
        ...(input.sourceUploadId && { sourceUploadId: input.sourceUploadId }),
        ...(input.sourceFilename && { sourceFilename: input.sourceFilename }),
        ...(input.sourceMediaType && {
          sourceMediaType: input.sourceMediaType,
        }),
        ...(input.attachmentType && { attachmentType: input.attachmentType }),
        ...(input.dedupKey && { dedupKey: input.dedupKey }),
      },
    };
  }
}

export const imageAdapter: ImageAdapter = new ImageAdapter();
