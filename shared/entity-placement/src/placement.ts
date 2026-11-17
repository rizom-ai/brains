import {
  decodeEntityIdPath,
  encodeEntityIdPath,
  entityIdPathSchema,
  type BaseEntity,
} from "@brains/entity-service";
import { readString } from "@brains/utils/record-fields";
import { posix } from "path";
import {
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  getExtensionForFormat,
} from "./extensions";

/**
 * Each contained type with the type it is contained in: book-section → book.
 * A contained entity lives inside its container's folder.
 */
export type Containment = ReadonlyMap<string, string>;

/** The containment the registry holds, read off each type's config. */
export function containmentOf(registry: {
  getEntityTypes(): string[];
  getEntityTypeConfig(type: string): { containedIn?: string | undefined };
}): Containment {
  return new Map(
    registry.getEntityTypes().flatMap((type) => {
      const container = registry.getEntityTypeConfig(type).containedIn;
      return container === undefined ? [] : [[type, container] as const];
    }),
  );
}

/** The type contained in a container, if any; the registry allows one. */
function containedIn(
  container: string,
  containment: Containment,
): string | undefined {
  return [...containment].find(([, owner]) => owner === container)?.[0];
}

/**
 * The entity a path names. `relativePath` is relative to the content root
 * and uses `/`: `post/first.md`, never an absolute or OS-specific path.
 */
export function parseEntityPath(
  relativePath: string,
  containment: Containment,
): { entityType: string; id: string } {
  const pathParts = relativePath.split("/");

  // Note entities are in root; subdirectory name is the entity type
  let entityType: string;
  let idPathParts: string[];

  if (pathParts.length === 1) {
    entityType = "note";
    idPathParts = pathParts;
  } else if (pathParts.length > 1 && pathParts[0]) {
    idPathParts = pathParts.slice(1);
    // Inside a container's folder, a nested path is its contained type.
    const contained =
      idPathParts.length > 1
        ? containedIn(pathParts[0], containment)
        : undefined;
    entityType = contained ?? pathParts[0];
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

/** The path an entity is stored at, relative to the content root, with `/`. */
export function buildEntityPath(
  entityId: string,
  entityType: string,
  extension: string,
  containment: Containment,
): string {
  // A contained entity lives in its container's folder.
  const folder = containment.get(entityType) ?? entityType;
  // Empty components are omitted only for filesystem placement, not identity.
  const cleanParts = decodeEntityIdPath(entityId).filter(
    (part) => part.length > 0,
  );
  const isRootNote = entityType === "note";

  if (cleanParts.length === 1) {
    return isRootNote
      ? posix.join(`${cleanParts[0]}${extension}`)
      : posix.join(folder, `${cleanParts[0]}${extension}`);
  }

  // Every segment is identity, including one equal to the entity type.
  const filename = cleanParts[cleanParts.length - 1];
  const directories = cleanParts.slice(0, -1);

  if (isRootNote) {
    return posix.join(...directories, `${filename}${extension}`);
  }

  return posix.join(folder, ...directories, `${filename}${extension}`);
}

/** Pure placement admission. Historical paths remain available for diagnostics. */
export function resolveEntityPlacement(
  entityType: string,
  entityId: string,
  extension: string,
  containment: Containment,
): {
  relativePath: string;
  owner: { entityType: string; id: string };
  writable: boolean;
} {
  const relativePath = buildEntityPath(
    entityId,
    entityType,
    extension,
    containment,
  );
  const owner = parseEntityPath(relativePath, containment);
  const segments = decodeEntityIdPath(entityId);
  return {
    relativePath,
    owner,
    writable:
      entityIdPathSchema.safeParse(segments).success &&
      (entityType !== "note" || segments.length === 1) &&
      owner.entityType === entityType &&
      owner.id === entityId,
  };
}

/** The file extension an entity is stored under. */
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
  const ext = posix.extname(filename).toLowerCase();
  return ext === ".md" ||
    IMAGE_EXTENSIONS.includes(ext) ||
    DOCUMENT_EXTENSIONS.includes(ext)
    ? filename.slice(0, -ext.length)
    : filename;
}
