import { assetRefSchema, type AssetRef } from "@brains/assets";
import type { EntityAdapter, EntitySchema } from "@brains/entity-service";
import {
  imageSchema,
  type Image,
  type ImageIngestionStatus,
  type ImageMetadata,
} from "../schemas/image";
import { inspectImageBytes, parseDataUrl } from "../lib/image-utils";

interface ImageProvenanceInput {
  sourceUrl?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceUploadId?: string;
  sourceFilename?: string;
  sourceMediaType?: string;
  attachmentType?: string;
  dedupKey?: string;
}

/** Input for a completed, asset-backed image entity. */
export interface CreateImageInput extends ImageProvenanceInput {
  assetRef: AssetRef;
  bytes: Uint8Array;
  declaredMediaType?: string;
  title: string;
  alt?: string;
  status?: "draft";
}

/** Input for a durable pending image that intentionally has no fake payload. */
export interface CreatePendingImageInput extends ImageProvenanceInput {
  title: string;
  alt?: string;
  status?: Extract<ImageIngestionStatus, "pending" | "failed">;
  processingError?: string;
}

/**
 * Pure adapter for image entities. Binary I/O remains in ingestion/read
 * callers; the adapter validates byte facts and serializes the opaque ref.
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
    const normalized = content.trim();
    if (!normalized || assetRefSchema.safeParse(normalized).success) {
      return { entityType: "image", content: normalized };
    }

    const parsed = parseDataUrl(normalized);
    const inspected = inspectImageBytes(parsed.bytes, parsed.mediaType);
    return {
      entityType: "image",
      content: normalized,
      metadata: {
        format: inspected.format,
        mediaType: inspected.mediaType,
        sizeBytes: inspected.sizeBytes,
        width: inspected.width,
        height: inspected.height,
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

  public createImageEntity(
    input: CreateImageInput,
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    const assetRef = assetRefSchema.parse(input.assetRef);
    const inspected = inspectImageBytes(input.bytes, input.declaredMediaType);

    return {
      entityType: "image",
      content: assetRef,
      metadata: {
        title: input.title,
        alt: input.alt ?? input.title,
        format: inspected.format,
        mediaType: inspected.mediaType,
        sizeBytes: inspected.sizeBytes,
        width: inspected.width,
        height: inspected.height,
        status: input.status ?? "draft",
        ...getProvenance(input),
      },
    };
  }

  public createPendingImageEntity(
    input: CreatePendingImageInput,
  ): Pick<Image, "entityType" | "content" | "metadata"> {
    return {
      entityType: "image",
      content: "",
      metadata: {
        title: input.title,
        alt: input.alt ?? input.title,
        status: input.status ?? "pending",
        ...(input.processingError && {
          processingError: input.processingError,
        }),
        ...getProvenance(input),
      },
    };
  }
}

function getProvenance(input: ImageProvenanceInput): ImageProvenanceInput {
  return {
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

export const imageAdapter: ImageAdapter = new ImageAdapter();
