import type { BaseEntity } from "@brains/sdk/entities";
import { entityIdPathSchema, decodeEntityIdPath, encodeEntityIdPath } from "@brains/entity-service";
import { extname, join } from "path";
import { readString } from "@brains/utils/record-fields";
import { IMAGE_EXTENSIONS, getExtensionForFormat } from "./image-file-utils";
import { DOCUMENT_EXTENSIONS } from "./document-file-utils";
import { toSyncRelativePath } from "./path-utils";

export function parseEntityPath(
  syncPath: string,
  filePath: string,
): { entityType: string; id: string } {
  const relativePath = toSyncRelativePath(syncPath, filePath);
  const pathParts = relativePath.split("/");

  // Note entities are in root; subdirectory name is the entity type
  let entityType: string;
  let idPathParts: string[];

  if (pathParts.length === 1) {
    entityType = "note";
    idPathParts = pathParts;
  } else if (pathParts.length > 1 && pathParts[0]) {
    entityType = pathParts[0];
    idPathParts = pathParts.slice(1);
  } else {
    entityType = "note";
    idPathParts = pathParts;
  }

  // Reconstruct ID: nested paths become colon-separated
  // e.g., site-content/landing/hero.md -> id: "landing:hero"
  let id: string;
  if (idPathParts.length > 1) {
    const lastPart = idPathParts[idPathParts.length - 1];
    if (lastPart) {
      idPathParts[idPathParts.length - 1] = stripEntityExtension(lastPart);
    }
    id = encodeEntityIdPath([idPathParts[0] ?? "", ...idPathParts.slice(1)]);
  } else {
    id = stripEntityExtension(idPathParts[0] ?? "");
  }

  return { entityType, id };
}

export function buildEntityFilePath(
  syncPath: string,
  entityId: string,
  entityType: string,
  extension: string = ".md",
): string {
  // Empty components are omitted only for filesystem placement, not identity.
  const cleanParts = decodeEntityIdPath(entityId).filter(
    (part) => part.length > 0,
  );
  const isRootNote = entityType === "note";

  if (cleanParts.length === 1) {
    return isRootNote
      ? join(syncPath, `${cleanParts[0]}${extension}`)
      : join(syncPath, entityType, `${cleanParts[0]}${extension}`);
  }

  // Every segment is identity, including one equal to the entity type.
  const filename = cleanParts[cleanParts.length - 1];
  const directories = cleanParts.slice(0, -1);

  if (isRootNote) {
    return join(syncPath, ...directories, `${filename}${extension}`);
  }

  return join(syncPath, entityType, ...directories, `${filename}${extension}`);
}

/** Pure placement admission. Historical paths remain available for diagnostics. */
export function resolveEntityPlacement(
  syncPath: string,
  entityType: string,
  entityId: string,
  extension: string = ".md",
): {
  relativePath: string;
  owner: { entityType: string; id: string };
  writable: boolean;
} {
  const filePath = buildEntityFilePath(
    syncPath,
    entityId,
    entityType,
    extension,
  );
  const owner = parseEntityPath(syncPath, filePath);
  const segments = decodeEntityIdPath(entityId);
  return {
    relativePath: toSyncRelativePath(syncPath, filePath),
    owner,
    writable:
      entityIdPathSchema.safeParse(segments).success &&
      (entityType !== "note" || segments.length === 1) &&
      owner.entityType === entityType &&
      owner.id === entityId,
  };
}

export function getEntityFileExtension(
  entity: Pick<BaseEntity, "entityType" | "metadata" | "content">,
): string {
  if (entity.entityType === "document") {
    return ".pdf";
  }

  if (entity.entityType !== "image") {
    return ".md";
  }

  const format = readString(entity.metadata, "format");
  if (format) {
    return getExtensionForFormat(format);
  }

  const match = entity.content.match(/^data:image\/([a-z+]+);base64,/i);
  return match?.[1] ? getExtensionForFormat(match[1]) : ".md";
}

function stripEntityExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return ext === ".md" ||
    IMAGE_EXTENSIONS.includes(ext) ||
    DOCUMENT_EXTENSIONS.includes(ext)
    ? filename.slice(0, -ext.length)
    : filename;
}
