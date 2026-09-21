import type { AttachmentCard } from "../contracts/agent";

export type ArtifactEntityType = "document" | "image";
export interface ArtifactEntityRef {
  entityType: ArtifactEntityType;
  id: string;
}
export function resolveArtifactEntityRefFromCard(
  card: Pick<AttachmentCard, "attachment">,
  baseUrl?: string,
): ArtifactEntityRef | undefined {
  const source = card.attachment.source;
  if (
    (source?.entityType === "document" || source?.entityType === "image") &&
    source.entityId
  )
    return { entityType: source.entityType, id: source.entityId };
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
  if (parsed.pathname === "/api/chat/attachments/document")
    return { entityType: "document", id };
  if (parsed.pathname === "/api/chat/attachments/image")
    return { entityType: "image", id };
  return undefined;
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
  if (typeof format === "string" && format.trim())
    return `${entityId}.${format === "jpeg" ? "jpg" : format}`;
  const extension = mediaType.split("/")[1]?.split("+")[0] ?? "png";
  return `${entityId}.${extension}`;
}
