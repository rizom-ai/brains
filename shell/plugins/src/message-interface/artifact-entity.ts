import { assetRefSchema, type AssetRef } from "@brains/entity-service";
import type { AttachmentCard } from "../contracts/agent";

export type ArtifactEntityType = "document" | "image";

export interface ArtifactEntityRef {
  entityType: ArtifactEntityType;
  id: string;
}

export interface ParsedArtifactDataUrl {
  mimeType: string;
  data: ArrayBuffer;
}

export interface ArtifactAssetReader {
  readAsset(ref: AssetRef): Promise<Uint8Array>;
}

export function resolveArtifactEntityRefFromCard(
  card: Pick<AttachmentCard, "attachment">,
  baseUrl?: string,
): ArtifactEntityRef | undefined {
  const source = card.attachment.source;
  if (
    (source?.entityType === "document" || source?.entityType === "image") &&
    source.entityId
  ) {
    return { entityType: source.entityType, id: source.entityId };
  }

  return resolveArtifactEntityRefFromUrl(
    card.attachment.downloadUrl ?? card.attachment.url,
    baseUrl,
  );
}

export function resolveArtifactEntityRefFromUrl(
  url: string | undefined,
  baseUrl = "http://local",
): ArtifactEntityRef | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return undefined;
  }

  const id = parsed.searchParams.get("id")?.trim();
  if (!id) return undefined;
  if (parsed.pathname === "/api/chat/attachments/document") {
    return { entityType: "document", id };
  }
  if (parsed.pathname === "/api/chat/attachments/image") {
    return { entityType: "image", id };
  }
  return undefined;
}

export function parseArtifactDataUrl(
  entityType: ArtifactEntityType,
  content: string,
): ParsedArtifactDataUrl | undefined {
  const parsed = parseBase64DataUrl(
    content,
    entityType === "document"
      ? /^application\/pdf$/i
      : /^image\/[a-z0-9.+-]+$/i,
  );
  if (!parsed) return undefined;
  if (
    entityType === "document" &&
    parsed.mimeType.toLowerCase() !== "application/pdf"
  ) {
    return undefined;
  }
  return parsed;
}

/** Resolve an artifact's bytes while retaining inline-image compatibility. */
export async function resolveArtifactEntityData(
  entityType: ArtifactEntityType,
  content: string,
  metadata: Record<string, unknown>,
  assets: ArtifactAssetReader,
): Promise<ParsedArtifactDataUrl | undefined> {
  const inline = parseArtifactDataUrl(entityType, content);
  if (inline) return inline;
  if (entityType !== "image") return undefined;

  const assetRef = assetRefSchema.safeParse(content.trim());
  const mediaType = metadata["mediaType"];
  if (
    !assetRef.success ||
    typeof mediaType !== "string" ||
    !/^image\/(?:png|jpeg|gif|webp)$/i.test(mediaType)
  ) {
    return undefined;
  }

  const bytes = await assets.readAsset(assetRef.data);
  return {
    mimeType: mediaType.toLowerCase(),
    data: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  };
}

export function getArtifactEntityFilename(
  metadata: Record<string, unknown> | null | undefined,
  entityId: string,
  entityType: ArtifactEntityType,
  mediaType: string,
): string {
  const filename = metadata?.["filename"];
  if (typeof filename === "string" && filename.trim()) return filename;
  if (entityType === "document") return `${entityId}.pdf`;

  const format = metadata?.["format"];
  if (typeof format === "string" && format.trim()) {
    return `${entityId}.${format === "jpeg" ? "jpg" : format}`;
  }

  const extension = mediaType.split("/")[1]?.split("+")[0] ?? "png";
  return `${entityId}.${extension}`;
}

function parseBase64DataUrl(
  dataUrl: string,
  mediaTypePattern: RegExp,
): ParsedArtifactDataUrl | undefined {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  const mimeType = match?.[1];
  const encoded = match?.[2];
  if (!mimeType || !encoded || !mediaTypePattern.test(mimeType)) {
    return undefined;
  }
  const buffer = Buffer.from(encoded, "base64");
  return {
    mimeType,
    data: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  };
}
