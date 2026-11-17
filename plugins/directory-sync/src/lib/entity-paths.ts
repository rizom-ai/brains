import {
  buildEntityPath,
  parseEntityPath as parseRelativeEntityPath,
  type Containment,
} from "@brains/entity-placement";
import { join } from "path";
import { toSyncRelativePath } from "./path-utils";

/**
 * Placement itself is `@brains/entity-placement`, shared with every other
 * surface that shows entities as files. These bind it to this plugin's sync
 * directory on disk.
 */
export {
  containmentOf,
  getEntityFileExtension,
  resolveEntityPlacement,
  type Containment,
} from "@brains/entity-placement";

export function parseEntityPath(
  syncPath: string,
  filePath: string,
  containment: Containment,
): { entityType: string; id: string } {
  return parseRelativeEntityPath(
    toSyncRelativePath(syncPath, filePath),
    containment,
  );
}

export function buildEntityFilePath(
  syncPath: string,
  entityId: string,
  entityType: string,
  extension: string,
  containment: Containment,
): string {
  return join(
    syncPath,
    buildEntityPath(entityId, entityType, extension, containment),
  );
}
