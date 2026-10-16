import { readFile } from "node:fs/promises";
import { internalFullScope, type EntityServiceClient } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import type { IFileOperations } from "../types/interfaces";
import { resolveInSyncPath } from "./path-utils";

export interface StoredEchoDeps {
  syncPath: string;
  entityService: Pick<EntityServiceClient, "getEntityWriteSnapshot">;
  fileOperations: Pick<IFileOperations, "parseEntityFromPath">;
}

/**
 * The paths that are not the brain's own exports. Auto-sync writes an
 * entity's serialized form, whose hash is the stored contentHash, so a
 * markdown file hashing to it holds nothing to import. Anything this cannot
 * confirm (a missing, binary or unmapped file, or no stored entity) is kept.
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
  if (!path.endsWith(".md")) return false;
  try {
    const content = await readFile(
      resolveInSyncPath(deps.syncPath, path),
      "utf8",
    );
    const snapshot = await deps.entityService.getEntityWriteSnapshot({
      ...deps.fileOperations.parseEntityFromPath(path),
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
