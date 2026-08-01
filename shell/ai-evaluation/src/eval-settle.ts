import { existsSync } from "fs";

const DEFAULT_DRAIN_POLL_INTERVAL_MS = 2000;

interface JobQueueLike {
  getActiveJobs(): Promise<Array<{ type: string }>>;
}

interface IndexReadinessLike {
  awaitIndexReady(options: { timeoutMs: number }): Promise<{
    ready: boolean;
    degraded: boolean;
    activeEmbeddingJobs: number;
    missingEmbeddings: number;
    staleEmbeddings: number;
    failedEmbeddings: number;
  }>;
}

/**
 * Whether prepareEvalEnvironment copied a prebuilt entity database into place.
 * Must be checked before bootEvalApp, which creates the database file itself.
 */
export function hasPrebuiltEvalDatabase(evalDbBase: string): boolean {
  return existsSync(`${evalDbBase}.db`);
}

export async function waitForJobsToDrain(
  jobQueue: JobQueueLike,
  options: { pollIntervalMs?: number } = {},
): Promise<void> {
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_DRAIN_POLL_INTERVAL_MS;
  console.log("Waiting for jobs to drain...");

  for (;;) {
    const active = await jobQueue.getActiveJobs();
    if (active.length === 0) break;

    const byType: Record<string, number> = {};
    for (const job of active) {
      byType[job.type] = (byType[job.type] ?? 0) + 1;
    }
    console.log(
      `  ${active.length} jobs: ${Object.entries(byType)
        .map(([type, count]) => `${type}(${count})`)
        .join(" ")}`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function waitForIndexReadiness(
  entityService: IndexReadinessLike,
): Promise<void> {
  console.log("Waiting for semantic index readiness...");
  const status = await entityService.awaitIndexReady({ timeoutMs: 120_000 });

  if (!status.ready) {
    throw new Error(`Semantic index was not ready: ${JSON.stringify(status)}`);
  }

  if (status.degraded) {
    console.warn("Semantic index ready with degraded embeddings:", status);
  }
}
