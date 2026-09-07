import type { DirectorySyncHost } from "../host";
import type { DurableBulkMutationChildRef } from "../types";

interface ProjectionBatchJobData {
  projectionBatch?: DurableBulkMutationChildRef | undefined;
}

export function runDirectoryProjectionBatchChild<TResult>(
  context: DirectorySyncHost,
  data: ProjectionBatchJobData,
  jobId: string,
  mutation: () => Promise<TResult>,
): Promise<TResult> {
  const batch = data.projectionBatch;
  if (!batch) return mutation();
  return context.mirror.coordination.runDurableBulkMutationChild(
    batch,
    jobId,
    mutation,
  );
}

export async function settleDirectoryProjectionBatchChild(
  context: DirectorySyncHost,
  data: ProjectionBatchJobData,
  jobId: string,
  outcome: "completed" | "failed",
): Promise<void> {
  const batch = data.projectionBatch;
  if (!batch) return;
  await context.mirror.coordination.settleDurableBulkMutationChild(
    batch,
    jobId,
    outcome,
  );
}
