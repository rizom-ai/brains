import type {
  EntityPluginContext,
  IRuntimeStateStore,
  JobHandler,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { createId } from "@brains/utils/id";
import { z } from "@brains/utils/zod";
import type { TopicsPluginConfig } from "../schemas/config";
import {
  TopicExtractionRun,
  topicExtractionDeps,
} from "./topic-extraction-run";
import { TOPICS_BATCH_COMPLETED_EVENT } from "./constants";

const EXECUTION_TIMEOUT_MS = 180_000;
const LEASE_DURATION_MS = EXECUTION_TIMEOUT_MS + 60_000;
const leaseSchema: z.ZodObject<{
  owner: z.ZodString;
  expiresAt: z.ZodNumber;
}> = z.object({ owner: z.string(), expiresAt: z.number() });
const jobDataSchema = z.object({});

type ExtractionLease = z.output<typeof leaseSchema>;

export async function enqueueTopicExtraction(
  context: EntityPluginContext,
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
  context: EntityPluginContext,
  leases: IRuntimeStateStore<ExtractionLease>,
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
  // skip deduplication preserves one pending successor even while another
  // attempt is processing. A lease keeps those attempts from racing.
  await enqueueTopicExtraction(context, 30_000);
  return null;
}

export async function releaseExtractionLease(
  leases: IRuntimeStateStore<ExtractionLease>,
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

export function createRankedTopicJobHandler(
  context: EntityPluginContext,
  config: TopicsPluginConfig,
  logger: Logger,
): JobHandler<"topics:extract", Record<string, never>, TopicExtractionResult> {
  const deps = topicExtractionDeps(context, config, logger);
  const leases = context.runtimeState.scoped({
    namespace: "topics.extraction",
    schema: leaseSchema,
  });

  return {
    executionTimeoutMs: EXECUTION_TIMEOUT_MS,
    validateAndParse: (data): Record<string, never> | null => {
      const parsed = jobDataSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    process: async (
      _data,
      _jobId,
      _progress,
      signal,
    ): Promise<TopicExtractionResult> => {
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
        if (run.changed > 0) {
          await context.messaging.send({
            type: TOPICS_BATCH_COMPLETED_EVENT,
            payload: { changed: run.changed },
            broadcast: true,
          });
        }
        return { calls: run.calls, remaining };
      } finally {
        await releaseExtractionLease(leases, lease);
      }
    },
  };
}
