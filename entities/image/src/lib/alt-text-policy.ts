import type { ImageMetadata } from "@brains/image";

/** What an image change asks of its alt text. */
export type AltTextAction = "describe" | "mark-owner" | "none";

export interface ImageChange {
  /** The image's visibility; an image without one is public. */
  readonly visibility?: string | undefined;
  readonly metadata: Partial<ImageMetadata>;
  /** Its metadata before an update; absent for a new image. */
  readonly previousMetadata?: Partial<ImageMetadata> | undefined;
}

const isReady = (metadata: Partial<ImageMetadata>): boolean =>
  metadata.status !== "pending" && metadata.status !== "failed";

/**
 * Alt text rewritten on a ready image, with its source left as it was, is
 * someone's edit (in Studio or through the agent), so it becomes the owner's.
 * A public, ready image whose alt text is still a stand-in is described.
 */
export function altTextAction(change: ImageChange): AltTextAction {
  const { metadata, previousMetadata } = change;
  const source = metadata.altSource ?? "fallback";
  if (
    previousMetadata &&
    isReady(previousMetadata) &&
    previousMetadata.alt !== metadata.alt &&
    (previousMetadata.altSource ?? "fallback") === source &&
    source !== "owner"
  ) {
    return "mark-owner";
  }
  const isPublic = (change.visibility ?? "public") === "public";
  return isPublic &&
    isReady(metadata) &&
    metadata.format !== "svg" &&
    source === "fallback"
    ? "describe"
    : "none";
}
