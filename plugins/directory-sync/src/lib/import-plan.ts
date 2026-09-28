import { internalFullScope, type EntityServiceClient } from "@brains/plugins";
import type { DirectoryImportPlan } from "../types/jobs";
import type { IFileOperations } from "../types/interfaces";

/** Capture before queueing/reading files, never when retrying stale work. */
export async function captureImportPlan(
  entityService: Pick<EntityServiceClient, "getEntityWriteSnapshot">,
  fileOperations: Pick<IFileOperations, "parseEntityFromPath">,
  paths: readonly string[],
): Promise<DirectoryImportPlan> {
  const plan: DirectoryImportPlan = [];
  for (const path of paths) {
    const target = fileOperations.parseEntityFromPath(path);
    const snapshot = await entityService.getEntityWriteSnapshot({
      ...target,
      visibilityScope: internalFullScope(
        "capture directory import write preconditions",
      ),
    });
    plan.push({
      path,
      ...target,
      expectedRevision: snapshot?.revision ?? null,
    });
  }
  return plan;
}
