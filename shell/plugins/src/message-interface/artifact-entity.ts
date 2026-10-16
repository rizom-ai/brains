import {
  assetRefSchema,
  readAssetBytes,
  type AssetOpener,
} from "@brains/entity-service";
import type { AttachmentCard } from "../contracts/agent";
import { formatContentDispositionHeader } from "./content-disposition";

export type ArtifactEntityType = "document" | "image";

export interface ArtifactEntityRef {
  entityType: ArtifactEntityType;
  id: string;
}

export interface ParsedArtifactDataUrl {
  mimeType: string;
  data: ArrayBuffer;
}

/** The stored fields of an artifact entity, read in reference mode. */
export interface StoredArtifact {
  content: unknown;
  metadata?: Record<string, unknown> | null;
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
  entity: StoredArtifact,
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

  const mimeType = assetMediaType(entityType, entity);
  if (!mimeType) return undefined;
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

/**
 * The HTTP response carrying an artifact's bytes. Stored asset chunks stream
 * as they are read; an inline data URL is decoded. Undefined when the content
 * is not this artifact type.
 */
export async function createArtifactResponse(
  reader: AssetOpener,
  input: {
    entityType: ArtifactEntityType;
    id: string;
    entity: StoredArtifact;
    disposition: "inline" | "attachment";
  },
): Promise<Response | undefined> {
  const { entityType, id, entity } = input;
  if (typeof entity.content !== "string") return undefined;
  const headers = (mediaType: string, sizeBytes: unknown): Headers => {
    const result = new Headers({
      "Content-Type": mediaType,
      "Content-Disposition": formatContentDispositionHeader({
        disposition: input.disposition,
        filename: getArtifactEntityFilename(
          entity.metadata,
          id,
          entityType,
          mediaType,
        ),
      }),
    });
    if (typeof sizeBytes === "number") {
      result.set("Content-Length", String(sizeBytes));
    }
    result.set("X-Content-Type-Options", "nosniff");
    // An SVG opened directly is a document on this origin: sandbox it so its
    // scripts never run with the viewer's session. <img> embedding is unaffected.
    if (/^image\/svg\+xml$/i.test(mediaType)) {
      result.set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
    }
    return result;
  };

  const ref = assetRefSchema.safeParse(entity.content);
  if (!ref.success) {
    const parsed = parseArtifactDataUrl(entityType, entity.content);
    return (
      parsed &&
      new Response(parsed.data, {
        headers: headers(parsed.mimeType, parsed.data.byteLength),
      })
    );
  }
  const mediaType = assetMediaType(entityType, entity);
  if (!mediaType) return undefined;
  return new Response(streamChunks(await reader.openAsset(ref.data)), {
    headers: headers(mediaType, entity.metadata?.["sizeBytes"]),
  });
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

/**
 * The media type of an asset-backed artifact, if it fits the type: the
 * recorded one, else what its stored format implies, as image reads do.
 */
function assetMediaType(
  entityType: ArtifactEntityType,
  entity: StoredArtifact,
): string | undefined {
  const recorded = entity.metadata?.["mediaType"];
  const format = entity.metadata?.["format"];
  const mediaType =
    typeof recorded === "string"
      ? recorded
      : entityType === "document"
        ? "application/pdf"
        : typeof format === "string"
          ? `image/${format === "jpg" ? "jpeg" : format}`
          : undefined;
  return mediaType && ARTIFACT_MEDIA_TYPES[entityType].test(mediaType)
    ? mediaType
    : undefined;
}

/** Stream stored chunks without holding the whole asset in memory. */
function streamChunks(
  chunks: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel(): Promise<void> {
      await iterator.return?.();
    },
  });
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
