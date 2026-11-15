import {
  firstPartyJobHandler,
  type ClassRuntimeStateStore,
  type FirstPartyJobHandler,
} from "@brains/sdk/internal/service-runtime";
import type { TopicsContext } from "./topics-context";
import type { Logger } from "@brains/utils/logger";
import { createId } from "@brains/utils/id";
import { z } from "@brains/utils/zod";
import type { TopicsPluginConfig } from "../schemas/config";
import {
  TopicExtractionRun,
  topicExtractionDeps,
} from "./topic-extraction-run";

const EXECUTION_TIMEOUT_MS = 180_000;
const LEASE_DURATION_MS = EXECUTION_TIMEOUT_MS + 60_000;
const leaseSchema: z.ZodObject<{
  owner: z.ZodString;
  expiresAt: z.ZodNumber;
}> = z.object({ owner: z.string(), expiresAt: z.number() });
const jobDataSchema: z.ZodType<Record<string, never>, unknown> = z.object({});

type ExtractionLease = z.output<typeof leaseSchema>;

export async function enqueueTopicExtraction(
  context: TopicsContext,
  delayMs = 0,
): Promise<string> {
  return context.jobs.enqueue({
    type: "topics:extract",
    data: {},
    options: {
      source: "topics",
      // Entity events are wakeup hints for a corpus-wide maintenance scan, not
      // children of the emitting projection. Do not inherit its causal budget.
      rootJobId: createId(),
      metadata: { operationType: "data_processing", silent: true },
      deduplication: "skip",
      deduplicationKey: "topics:extract",
      delayMs,
    },
  });
}

/**
 * Take the extraction lease, or take over one whose holder let it expire.
 * While another attempt holds it, enqueue a successor and return null.
 */
export async function acquireExtractionLease(
  context: TopicsContext,
  leases: ClassRuntimeStateStore<ExtractionLease>,
): Promise<ExtractionLease | null> {
  const lease = {
    owner: createId(),
    expiresAt: Date.now() + LEASE_DURATION_MS,
  };
  if (await leases.setIfNotExists("lease", lease)) return lease;
  const previous = await leases.get("lease");
  if (
    previous &&
    previous.expiresAt <= Date.now() &&
    (await leases.compareAndSet("lease", previous, lease))
  )
    return lease;
  // Jobs run one at a time, so a held lease belongs to an attempt the queue
  // gave up on. Retry once that holder has had time to finish or expire.
  await enqueueTopicExtraction(context, 30_000);
  return null;
}

export async function releaseExtractionLease(
  leases: ClassRuntimeStateStore<ExtractionLease>,
  lease: ExtractionLease,
): Promise<void> {
  // Claim release atomically before deleting: an expired lease may have
  // been taken over by a new worker, whose ownership we must not remove.
  if (
    await leases.compareAndSet("lease", lease, {
      owner: `${lease.owner}:releasing`,
      expiresAt: Date.now() + LEASE_DURATION_MS,
    })
  ) {
    await leases.delete("lease");
  }
}

export interface TopicExtractionResult {
  calls: number;
  remaining: number;
}

/**
 * The ranked extraction job, as the class registered it: topics:extract,
 * one run at a time across every worker, a lease held for the run.
 */
export function rankedTopicExtractionJob(
  context: TopicsContext,
  config: TopicsPluginConfig,
  logger: Logger,
): FirstPartyJobHandler {
  const deps = topicExtractionDeps(context, config, logger);
  const leases = context.runtimeState.scoped({
    namespace: "topics.extraction",
    schema: leaseSchema,
  });

  return firstPartyJobHandler<Record<string, never>>({
    type: "extract",
    input: jobDataSchema,
    executionTimeoutMs: EXECUTION_TIMEOUT_MS,
    // A job woken during a run waits for it instead of meeting its lease.
    exclusive: true,
    process: async ({ signal }): Promise<TopicExtractionResult> => {
      signal.throwIfAborted();
      const lease = await acquireExtractionLease(context, leases);
      if (!lease) return { calls: 0, remaining: 0 };
      try {
        const run = await TopicExtractionRun.load(deps, signal);
        await run.select();
        await run.vote();
        // Changes during AI calls must not leak ineligible votes into selection.
        // Their original hash makes concurrent edits stale for the successor.
        await run.rescan();
        await run.select();
        const remaining = run.remaining();
        if (remaining > 0 || run.selectionPending())
          await enqueueTopicExtraction(context);
        return { calls: run.calls, remaining };
      } finally {
        await releaseExtractionLease(leases, lease);
      }
    },
  });
}
