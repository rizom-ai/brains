import {
  type ServiceEntityMirrorClient,
  internalFullScope,
} from "@brains/sdk/internal/service-runtime";
import type { DirectoryImportPlan } from "../types/jobs";
import type { IFileOperations } from "../types/interfaces";

/**
 * Capture before queueing/reading files, never when retrying stale work.
 *
 * A type with no adapter cannot read its stored entity back, so its file is
 * admitted only to create one: an import that finds an entity stored skips
 * the file as stale rather than overwrite it.
 */
export async function captureImportPlan(
  entityService: Pick<
    ServiceEntityMirrorClient,
    "getEntityWriteSnapshot" | "hasEntityType"
  >,
  fileOperations: Pick<IFileOperations, "parseEntityFromPath">,
  paths: readonly string[],
): Promise<DirectoryImportPlan> {
  const plan: DirectoryImportPlan = [];
  for (const path of paths) {
    const target = fileOperations.parseEntityFromPath(path);
    const snapshot = entityService.hasEntityType(target.entityType)
      ? await entityService.getEntityWriteSnapshot({
          ...target,
          visibilityScope: internalFullScope(
            "capture directory import write preconditions",
          ),
        })
      : null;
    plan.push({
      path,
      ...target,
      expectedRevision: snapshot?.revision ?? null,
    });
  }
  return plan;
}
