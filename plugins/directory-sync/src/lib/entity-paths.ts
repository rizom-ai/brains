import type { BaseEntity } from "@brains/plugins";
import { extname, join } from "path";
import { IMAGE_EXTENSIONS, getExtensionForFormat } from "./image-file-utils";
import { DOCUMENT_EXTENSIONS } from "./document-file-utils";
import { toSyncRelativePath } from "./path-utils";

export function parseEntityPath(
  syncPath: string,
  filePath: string,
): { entityType: string; id: string } {
  const relativePath = toSyncRelativePath(syncPath, filePath);
  const pathParts = relativePath.split("/");

  // Base entities are in root; subdirectory name is the entity type
  let entityType: string;
  let idPathParts: string[];

  if (pathParts.length === 1) {
    entityType = "base";
    idPathParts = pathParts;
  } else if (pathParts.length > 1 && pathParts[0]) {
    entityType = pathParts[0];
    idPathParts = pathParts.slice(1);
  } else {
    entityType = "base";
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
    id = idPathParts.join(":");
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
  const cleanParts = entityId.split(":").filter((part) => part.length > 0);
  const isBase = entityType === "base";

  if (cleanParts.length === 1) {
    return isBase
      ? join(syncPath, `${cleanParts[0]}${extension}`)
      : join(syncPath, entityType, `${cleanParts[0]}${extension}`);
  }

  // Skip first part if it duplicates the entity type (e.g., "summary/summary/...")
  let pathParts = cleanParts;
  if (cleanParts[0] === entityType) {
    pathParts = cleanParts.slice(1);
  }

  const filename = pathParts[pathParts.length - 1];
  const directories = pathParts.slice(0, -1);

  if (isBase) {
    return join(syncPath, ...directories, `${filename}${extension}`);
  }

  return join(syncPath, entityType, ...directories, `${filename}${extension}`);
}

export function getEntityFileExtension(entity: BaseEntity): string {
  if (entity.entityType === "document") {
    return ".pdf";
  }

  if (entity.entityType !== "image") {
    return ".md";
  }

  const format = (entity.metadata as { format?: string }).format;
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
