import type { ServicePluginContext } from "@brains/plugins";
import type { DirectoryProjectionBatchRef } from "../types";

interface ProjectionBatchJobData {
  projectionBatch?: DirectoryProjectionBatchRef | undefined;
}

export function runDirectoryProjectionBatchChild<TResult>(
  context: ServicePluginContext,
  data: ProjectionBatchJobData,
  jobId: string,
  mutation: () => Promise<TResult>,
): Promise<TResult> {
  const batch = data.projectionBatch;
  if (!batch) return mutation();
  const coordinator = context.bulkMutations;
  return coordinator.runDurableBulkMutationChild(
    {
      source: "directory-sync",
      operationId: batch.operationId,
      rootJobId: batch.rootJobId,
      childKey: batch.childKey,
      expectedChildren: batch.expectedChildren,
      jobId,
    },
    mutation,
  );
}

export async function settleDirectoryProjectionBatchChild(
  context: ServicePluginContext,
  data: ProjectionBatchJobData,
  jobId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  const batch = data.projectionBatch;
  if (!batch) return;
  const coordinator = context.bulkMutations;
  await coordinator.settleDurableBulkMutationChild({
    operationId: batch.operationId,
    childKey: batch.childKey,
    jobId,
    outcome,
  });
}
