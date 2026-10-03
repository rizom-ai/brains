import {
  assetRefSchema,
  type AssetRef,
  type EntityAdapter,
  type EntitySchema,
} from "@brains/entity-service";
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
  type ImageByteDescription,
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

/** Descriptive fields shared by inline and asset-backed image creation. */
export interface ImageDescription {
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
 * Input for creating an image entity
 */
export interface CreateImageInput extends ImageDescription {
  dataUrl: string;
}

/** Input for an image whose bytes were staged as an asset. */
export interface CreateAssetImageInput extends ImageDescription {
  asset: { ref: AssetRef; sizeBytes: number };
  /** The staged bytes' format, media type and size, read from the bytes. */
  description: ImageByteDescription;
}

function describedMetadata(
  input: ImageDescription,
): Omit<ImageMetadata, "format" | "width" | "height"> {
  return {
    title: input.title,
    alt: input.alt ?? input.title,
    ...(input.status && { status: input.status }),
    ...(input.sourceUrl && { sourceUrl: input.sourceUrl }),
    ...(input.sourceEntityType && {
      sourceEntityType: input.sourceEntityType,
    }),
    ...(input.sourceEntityId && { sourceEntityId: input.sourceEntityId }),
    ...(input.sourceUploadId && { sourceUploadId: input.sourceUploadId }),
    ...(input.sourceFilename && { sourceFilename: input.sourceFilename }),
    ...(input.sourceMediaType && { sourceMediaType: input.sourceMediaType }),
    ...(input.attachmentType && { attachmentType: input.attachmentType }),
    ...(input.dedupKey && { dedupKey: input.dedupKey }),
  };
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
    // Asset-backed rows carry their binary facts in stored metadata, and a
    // pending or failed image has no bytes to read them from.
    if (content === "" || assetRefSchema.safeParse(content).success) {
      return { entityType: "image", content };
    }
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
   * Create image entity data for an image whose bytes do not exist yet: no
   * payload, and no format or dimensions until they do.
   */
  public createPendingImageEntity(
    input: ImageDescription & { status: "pending" | "failed" },
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    return {
      entityType: "image",
      content: "",
      metadata: describedMetadata(input),
    };
  }

  /**
   * Create image entity data from input.
   * Auto-detects format and dimensions from the data URL.
   */
  public createImageEntity(
    input: CreateImageInput,
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    const { dataUrl } = input;
    const { format, base64 } = parseDataUrl(dataUrl);
    const dimensions = detectImageDimensions(base64);

    const detectedFormat = detectImageFormat(base64);
    const finalFormat = detectedFormat ?? requireImageFormat(format);

    const { title, alt, ...described } = describedMetadata(input);
    return {
      entityType: "image",
      content: dataUrl,
      metadata: {
        title,
        alt,
        format: finalFormat,
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
        ...described,
      },
    };
  }

  /**
   * Create image entity data for staged bytes, with the format, media type
   * and dimensions described from those bytes.
   */
  public createAssetImageEntity(
    input: CreateAssetImageInput,
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    const { title, alt, ...described } = describedMetadata(input);
    return {
      entityType: "image",
      content: input.asset.ref,
      metadata: {
        title,
        alt,
        ...input.description,
        sizeBytes: input.asset.sizeBytes,
        ...described,
      },
    };
  }
}

export const imageAdapter: ImageAdapter = new ImageAdapter();
