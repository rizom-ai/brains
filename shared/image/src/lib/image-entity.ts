import type {
  Image,
  ImageMetadata,
  ImageFormat,
  ImageIngestionStatus,
} from "../schemas/image";
import {
  parseDataUrl,
  detectImageDimensions,
  detectImageFormat,
  toImageFormat,
} from "./image-utils";

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
 * What an image data URL says about itself: its format and dimensions. A
 * title, alt text and provenance arrive beside it.
 */
export function imageMetadataFor(
  content: string,
): Pick<ImageMetadata, "format" | "width" | "height"> {
  const { format, base64 } = parseDataUrl(content);
  const dimensions = detectImageDimensions(base64);
  return {
    format: requireImageFormat(format),
    width: dimensions?.width ?? 0,
    height: dimensions?.height ?? 0,
  };
}

/**
 * Create image entity data from input.
 * Auto-detects format and dimensions from the data URL.
 */
export function createImageEntity(
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
