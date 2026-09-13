import { createId } from "@brains/utils/id";
import type {
  ContentGenerationRequestInput,
  ContentGenerationBatchResult,
  ContentGenerationItemResult,
  ContentGenerationJobData,
  ContentGenerationPlan,
} from "./generation-contracts";

/**
 * Runtime wiring, never author-supplied tool input. The plugin layer owns job
 * options and attribution; content-service only decides what to enqueue.
 */
export interface GenerationQueueBinding {
  /** Existing root job ID to share; a fresh one is allocated otherwise. */
  batchId?: string | undefined;
  enqueue(jobData: ContentGenerationJobData, batchId: string): Promise<string>;
}

/**
 * Admitted children share one root job ID, which is the batch correlation key.
 * The queue already indexes that durably, so no separate batch record is kept:
 * `getJobsByRootJobId(batchId)` recovers the children after a restart. Targets
 * are independent, so a failure mid-admission leaves earlier children queued,
 * matching existing batch enqueue behavior. Re-submitting is safe because each
 * job carries its own operation ID and conditional-write receipt.
 */
export async function submitContentGeneration(
  planner: {
    planGeneration(
      request: ContentGenerationRequestInput,
      signal?: AbortSignal,
    ): Promise<ContentGenerationPlan>;
  },
  request: ContentGenerationRequestInput,
  binding: GenerationQueueBinding,
  signal?: AbortSignal,
): Promise<ContentGenerationBatchResult> {
  const plan = await planner.planGeneration(request, signal);
  signal?.throwIfAborted();

  const queueing = plan.planned.length > 0 && !request.options?.dryRun;
  const batchId = queueing ? (binding.batchId ?? createId()) : undefined;
  // Once admission starts the queue owns the work, not the caller's signal.
  const jobIds = batchId
    ? await Promise.all(
        plan.planned.map(({ jobData }) => binding.enqueue(jobData, batchId)),
      )
    : [];

  const items = Array.from<ContentGenerationItemResult | undefined>({
    length: plan.totalTargets,
  });
  for (const { index, target, entityId, reason } of plan.skipped) {
    items[index] = {
      destination: { ...target.destination, entityId },
      templateName: target.templateName,
      status: "skipped",
      reason,
    };
  }
  plan.planned.forEach(({ index, target, entityId }, position) => {
    const jobId = jobIds[position];
    const base = {
      destination: { ...target.destination, entityId },
      templateName: target.templateName,
    };
    items[index] = jobId
      ? { ...base, status: "queued", jobId }
      : { ...base, status: "planned" };
  });

  return {
    items: items.flatMap((item) => (item ? [item] : [])),
    totalTargets: plan.totalTargets,
    plannedTargets: plan.planned.length,
    queuedTargets: jobIds.length,
    skippedTargets: plan.skipped.length,
    ...(batchId && { batchId }),
  };
}
