import type { AttachmentCard } from "../contracts/agent";
import { parseBase64DataUrl } from "@brains/utils/data-url";

export type ArtifactEntityType = "document" | "image";

export interface ArtifactEntityRef {
  entityType: ArtifactEntityType;
  id: string;
}

export interface ParsedArtifactDataUrl {
  mimeType: string;
  data: ArrayBuffer;
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
  const parsed = parseDataUrlOf(
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

function parseDataUrlOf(
  dataUrl: string,
  mediaTypePattern: RegExp,
): ParsedArtifactDataUrl | undefined {
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed || !mediaTypePattern.test(parsed.mimeType)) return undefined;
  const buffer = parsed.data;
  return {
    mimeType: parsed.mimeType,
    data: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  };
}
