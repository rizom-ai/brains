import { imageMetadataSchema, type ImageMetadata } from "@brains/image";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { altTextAction } from "./alt-text-policy";

/** What the alt-text listener reads, writes and queues through. */
export interface AltTextDeps {
  /** Whether the brain has a model that reads images. */
  readonly canDescribe: () => boolean;
  /** An image as stored, at every visibility, without its bytes. */
  readonly readStored: (id: string) => Promise<BaseEntity | null>;
  /** The public images, as stored. */
  readonly listPublic: () => Promise<BaseEntity[]>;
  readonly update: (entity: BaseEntity) => Promise<unknown>;
  readonly enqueueDescribe: (imageId: string) => Promise<unknown>;
}

/** An entity change, as the entity events carry it. */
export interface ImageChangeEvent {
  readonly entityType: string;
  readonly entityId: string;
  readonly entity?: BaseEntity | undefined;
  readonly previousMetadata?: Record<string, unknown> | undefined;
}

const metadataOf = (value: unknown): Partial<ImageMetadata> | undefined => {
  const parsed = imageMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/**
 * Queue a description for a public image whose alt text is a stand-in, or
 * mark alt text someone rewrote as the owner's, so no description replaces it.
 */
export async function handleImageChange(
  deps: AltTextDeps,
  change: ImageChangeEvent,
): Promise<void> {
  if (change.entityType !== "image" || !change.entity) return;
  const metadata = metadataOf(change.entity.metadata);
  if (!metadata) return;
  const action = altTextAction({
    visibility: change.entity.visibility,
    metadata,
    previousMetadata: change.previousMetadata
      ? { ...change.previousMetadata }
      : undefined,
  });
  if (action === "describe" && deps.canDescribe()) {
    await deps.enqueueDescribe(change.entityId);
  }
  if (action === "mark-owner") {
    // The record as stored now: its alt text must still be the edit's.
    const stored = await deps.readStored(change.entityId);
    if (!stored || stored.metadata["alt"] !== metadata.alt) return;
    await deps.update({
      ...stored,
      metadata: { ...stored.metadata, altSource: "owner" },
    });
  }
}

/** Queue a description for every public image whose alt text is a stand-in. */
export async function queueUndescribedImages(deps: AltTextDeps): Promise<void> {
  if (!deps.canDescribe()) return;
  const images = await deps.listPublic();
  for (const image of images) {
    const metadata = metadataOf(image.metadata);
    if (
      metadata &&
      altTextAction({ visibility: image.visibility, metadata }) === "describe"
    ) {
      await deps.enqueueDescribe(image.id);
    }
  }
}
