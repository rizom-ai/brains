import type {
  ServiceJobs,
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/sdk/services";
import { faqSourceReviewJob } from "../jobs/source-review-contract";
import { z } from "@brains/utils/zod";
import { reviewFaqsCiting, type WithdrawalEntities } from "./stale-sources";

const pendingSchema: z.ZodObject<{
  sourceId: z.ZodString;
  jobId: z.ZodOptional<z.ZodString>;
}> = z.object({ sourceId: z.string().min(1), jobId: z.string().optional() });
export type SourceWithdrawals = IRuntimeStateStore<
  z.output<typeof pendingSchema>
>;
type Jobs = Pick<ServiceJobs, "enqueue" | "find">;

/** Pending withdrawal identities survive failed/pruned jobs and have no expiry. */
export function sourceWithdrawals(
  runtimeState: IRuntimeStateNamespace,
): SourceWithdrawals {
  return runtimeState.scoped({
    namespace: "faq.source-withdrawals",
    schema: pendingSchema,
  });
}

export async function enqueueWithdrawal(
  store: SourceWithdrawals,
  jobs: Jobs,
  withdrawalId: string,
): Promise<void> {
  const pending = await store.get(withdrawalId);
  if (!pending) return;
  if (pending.jobId) {
    const job = await jobs.find(pending.jobId);
    if (job?.status === "pending" || job?.status === "processing") return;
  }
  const job = await jobs.enqueue(faqSourceReviewJob, {
    sourceId: pending.sourceId,
    withdrawalId,
  });
  const jobId = job.id;
  // Completion may have removed this immutable event identity while enqueueing.
  // CAS must not resurrect it, nor replace another enqueue's newer pointer.
  await store.compareAndSet(withdrawalId, pending, { ...pending, jobId });
}

export async function completeWithdrawal(
  entities: WithdrawalEntities,
  store: SourceWithdrawals,
  sourceId: string,
  withdrawalId: string,
): Promise<string[]> {
  const reviewed = await reviewFaqsCiting(entities, sourceId, withdrawalId);
  // A durable completion receipt must precede removal of pending work.
  await store.delete(withdrawalId);
  return reviewed;
}

export async function resumeWithdrawals(
  store: SourceWithdrawals,
  jobs: Jobs,
  signal: AbortSignal,
): Promise<void> {
  let afterKey: string | undefined;
  for (;;) {
    signal.throwIfAborted();
    const page = await store.list({ limit: 100, afterKey });
    if (page.length === 0) return;
    for (const record of page) {
      signal.throwIfAborted();
      await enqueueWithdrawal(store, jobs, record.key);
    }
    afterKey = page.at(-1)?.key;
    if (page.length < 100) return;
  }
}
