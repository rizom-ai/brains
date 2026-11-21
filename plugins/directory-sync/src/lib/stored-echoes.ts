import {
  type ServiceEntityMirrorClient,
  internalFullScope,
} from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import type { IFileOperations } from "../types/interfaces";
import { resolveInSyncPath } from "./path-utils";

export interface StoredEchoDeps {
  syncPath: string;
  entityService: Pick<
    ServiceEntityMirrorClient,
    "getEntityWriteSnapshot" | "hasEntityType"
  >;
  fileOperations: Pick<
    IFileOperations,
    "parseEntityFromPath" | "isEntityFile" | "readStoredText"
  >;
}

/**
 * The paths that are not the brain's own exports. Auto-sync writes an
 * entity's serialized form, whose hash is the stored contentHash, so a
 * markdown file hashing to it holds nothing to import. Anything this cannot
 * confirm (a missing, binary or unmapped file, no stored entity, or a type
 * not registered yet, whose stored entity cannot be read back) is kept.
 */
export async function withoutStoredEchoes(
  deps: StoredEchoDeps,
  paths: readonly string[],
): Promise<string[]> {
  const kept = await Promise.all(
    paths.map(async (path) => ((await isStoredEcho(deps, path)) ? [] : [path])),
  );
  return kept.flat();
}

async function isStoredEcho(
  deps: StoredEchoDeps,
  path: string,
): Promise<boolean> {
  if (!path.endsWith(".md") && !path.endsWith(".yaml")) return false;
  if (!deps.fileOperations.isEntityFile(path)) return false;
  try {
    const target = deps.fileOperations.parseEntityFromPath(path);
    // While plugins register, a later plugin's type has no adapter yet.
    if (!deps.entityService.hasEntityType(target.entityType)) return false;
    const content = await deps.fileOperations.readStoredText(
      resolveInSyncPath(deps.syncPath, path),
    );
    const snapshot = await deps.entityService.getEntityWriteSnapshot({
      ...target,
      visibilityScope: internalFullScope(
        "compare a changed file with its entity",
      ),
    });
    return snapshot?.entity.contentHash === computeContentHash(content);
  } catch {
    // Unreadable, deleted or unmapped: the import decides what it is.
    return false;
  }
}
