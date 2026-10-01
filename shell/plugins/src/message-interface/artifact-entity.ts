import {
  assetRefSchema,
  readAssetBytes,
  type AssetOpener,
} from "@brains/entity-service";
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

export type ArtifactContent =
  | ({ status: "ready" } & ParsedArtifactDataUrl)
  | { status: "oversized"; sizeBytes: number };

const ARTIFACT_MEDIA_TYPES: Record<ArtifactEntityType, RegExp> = {
  document: /^application\/pdf$/i,
  image: /^image\/[a-z0-9.+-]+$/i,
};

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
  const parsed = parseBase64DataUrl(content, ARTIFACT_MEDIA_TYPES[entityType]);
  if (!parsed) return undefined;
  if (
    entityType === "document" &&
    parsed.mimeType.toLowerCase() !== "application/pdf"
  ) {
    return undefined;
  }
  return parsed;
}

/**
 * An artifact's bytes, whether stored inline as a data URL or as an asset.
 * An asset over `maxBytes` is refused from its recorded size before any
 * bytes are loaded. Undefined when the content is not a deliverable artifact.
 */
export async function readArtifactContent(
  reader: AssetOpener,
  entityType: ArtifactEntityType,
  entity: { content: unknown; metadata?: Record<string, unknown> | null },
  maxBytes?: number,
): Promise<ArtifactContent | undefined> {
  if (typeof entity.content !== "string") return undefined;
  const ref = assetRefSchema.safeParse(entity.content);
  if (!ref.success) {
    const parsed = parseArtifactDataUrl(entityType, entity.content);
    if (!parsed) return undefined;
    if (maxBytes !== undefined && parsed.data.byteLength > maxBytes) {
      return { status: "oversized", sizeBytes: parsed.data.byteLength };
    }
    return { status: "ready", ...parsed };
  }

  const mimeType = entity.metadata?.["mediaType"];
  if (
    typeof mimeType !== "string" ||
    !ARTIFACT_MEDIA_TYPES[entityType].test(mimeType)
  ) {
    return undefined;
  }
  const recordedSize = entity.metadata?.["sizeBytes"];
  if (
    maxBytes !== undefined &&
    typeof recordedSize === "number" &&
    recordedSize > maxBytes
  ) {
    return { status: "oversized", sizeBytes: recordedSize };
  }
  const data = await readAssetBytes(reader, ref.data);
  if (maxBytes !== undefined && data.byteLength > maxBytes) {
    return { status: "oversized", sizeBytes: data.byteLength };
  }
  return {
    status: "ready",
    mimeType,
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
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
