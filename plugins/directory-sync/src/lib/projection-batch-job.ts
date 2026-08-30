import type { ServicePluginContext } from "@brains/plugins";
import type { DurableBulkMutationChildRef } from "../types";

interface ProjectionBatchJobData {
  projectionBatch?: DurableBulkMutationChildRef | undefined;
}

export function runDirectoryProjectionBatchChild<TResult>(
  context: ServicePluginContext,
  data: ProjectionBatchJobData,
  jobId: string,
  mutation: () => Promise<TResult>,
): Promise<TResult> {
  const batch = data.projectionBatch;
  if (!batch) return mutation();
  return context.entityCoordination.runDurableBulkMutationChild(
    batch,
    jobId,
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
  await context.entityCoordination.settleDurableBulkMutationChild(
    batch,
    jobId,
    outcome,
  );
}
