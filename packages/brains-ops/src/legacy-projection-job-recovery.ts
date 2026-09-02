import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { JobQueueService, type JobInfo } from "@brains/job-queue";
import { z } from "@brains/utils/zod";

export const LEGACY_PROJECTION_JOB_TYPES = [
  "conversation-memory:project",
  "skill:project",
  "swot:derive",
  "topic:project",
] as const;

export const legacyProjectionJobTypeSchema: z.ZodEnum<{
  "conversation-memory:project": "conversation-memory:project";
  "skill:project": "skill:project";
  "swot:derive": "swot:derive";
  "topic:project": "topic:project";
}> = z.enum(LEGACY_PROJECTION_JOB_TYPES);
export type LegacyProjectionJobType = z.output<
  typeof legacyProjectionJobTypeSchema
>;

export const LEGACY_PROJECTION_RETIREMENT_REASON =
  "Retired legacy projection job superseded by scheduler-owned projections";

export interface RetireLegacyProjectionJobOptions {
  databasePath: string;
  jobId: string;
  jobType: LegacyProjectionJobType;
  confirmation?: string | undefined;
  dryRun?: boolean | undefined;
  now?: (() => number) | undefined;
}

export interface RetireLegacyProjectionJobResult {
  databasePath: string;
  job: Pick<
    JobInfo,
    | "id"
    | "type"
    | "status"
    | "retryCount"
    | "maxRetries"
    | "createdAt"
    | "startedAt"
    | "completedAt"
  >;
  retired: boolean;
}

function summarizeJob(job: JobInfo): RetireLegacyProjectionJobResult["job"] {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

function assertRetirable(
  job: JobInfo,
  expectedType: LegacyProjectionJobType,
): void {
  if (job.type !== expectedType) {
    throw new Error(
      `Job ${job.id} has type ${job.type}; expected ${expectedType}`,
    );
  }
  if (job.status !== "pending" && job.status !== "processing") {
    throw new Error(`Job ${job.id} is already terminal (${job.status})`);
  }
  if (
    job.attemptId !== null ||
    job.workerSlotId !== null ||
    job.workerSessionId !== null ||
    job.leaseExpiresAt !== null ||
    job.attemptHeartbeatAt !== null
  ) {
    throw new Error(`Job ${job.id} still has attempt ownership`);
  }
  if (job.progress !== null || job.result != null) {
    throw new Error(`Job ${job.id} contains partial progress or a result`);
  }
}

/**
 * Retire one exact pre-scheduler projection job after proving that no attempt
 * owns it. This is deliberately not a general job cancellation API.
 */
export async function retireLegacyProjectionJob(
  options: RetireLegacyProjectionJobOptions,
): Promise<RetireLegacyProjectionJobResult> {
  const databasePath = resolve(options.databasePath);
  if (!existsSync(databasePath)) {
    throw new Error(`Job database does not exist: ${databasePath}`);
  }

  const jobType = legacyProjectionJobTypeSchema.parse(options.jobType);
  const service = JobQueueService.createFresh({ url: `file:${databasePath}` });
  try {
    const job = await service.getStatus(options.jobId);
    if (!job) throw new Error(`Job not found: ${options.jobId}`);
    assertRetirable(job, jobType);

    if (options.dryRun) {
      if (options.confirmation !== undefined) {
        throw new Error("Dry-run recovery must not include confirmation");
      }
      return { databasePath, job: summarizeJob(job), retired: false };
    }

    const expectedConfirmation = `retire:${job.id}`;
    if (options.confirmation !== expectedConfirmation) {
      throw new Error(
        `Refusing to retire ${job.id}; expected --confirm ${expectedConfirmation}`,
      );
    }

    const retired = await service.retireUnownedActiveJob({
      jobId: job.id,
      expectedType: jobType,
      reason: LEGACY_PROJECTION_RETIREMENT_REASON,
      now: options.now?.() ?? Date.now(),
    });
    if (!retired) {
      throw new Error(
        `Job ${job.id} changed or acquired ownership before retirement`,
      );
    }
    return { databasePath, job: summarizeJob(retired), retired: true };
  } finally {
    service.close();
  }
}
