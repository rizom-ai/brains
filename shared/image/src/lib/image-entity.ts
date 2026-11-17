import { assetRefSchema, type AssetRef } from "@brains/entity-service";
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
  type ImageByteDescription,
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

/** Descriptive fields shared by inline, asset-backed and pending images. */
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
 * What an image data URL says about itself: its format and dimensions. A
 * title, alt text and provenance arrive beside it. An asset-backed image
 * carries its facts in stored metadata, and a pending or failed image has
 * no bytes yet: neither says anything.
 */
export function imageMetadataFor(
  content: string,
): Partial<Pick<ImageMetadata, "format" | "width" | "height">> {
  if (content === "" || assetRefSchema.safeParse(content).success) return {};
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
 * Image entity data for staged bytes, with the format, media type and
 * dimensions described from those bytes.
 */
export function createAssetImageEntity(
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

/**
 * Image entity data for an image whose bytes do not exist yet: no payload,
 * and no format or dimensions until they do.
 */
export function createPendingImageEntity(
  input: ImageDescription & { status: "pending" | "failed" },
): Pick<Image, "entityType" | "content" | "metadata"> {
  return {
    entityType: "image",
    content: "",
    metadata: describedMetadata(input),
  };
}
