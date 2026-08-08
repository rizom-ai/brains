import { z } from "@brains/utils/zod";
import type { DeduplicationStrategy } from "./schema/types";
import { JOB_STATUS } from "./schemas";

export interface DeduplicationCandidate {
  id: string;
  status: "pending" | "processing";
  createdAt: number;
  metadata: unknown;
}

const deduplicatedJobMetadataSchema = z.looseObject({
  deduplicationKey: z.string().optional(),
});

/**
 * Applies queue deduplication policy to active jobs of a single type.
 */
export class JobDeduplicator {
  public findDuplicate(
    activeJobs: DeduplicationCandidate[],
    strategy?: DeduplicationStrategy,
    deduplicationKey?: string,
  ): DeduplicationCandidate | null {
    if (!strategy || strategy === "none") {
      return null;
    }

    const matchingJobs = this.filterByDeduplicationKey(
      activeJobs,
      deduplicationKey,
    ).sort(
      (left, right) =>
        right.createdAt - left.createdAt || right.id.localeCompare(left.id),
    );
    const pending =
      matchingJobs.find((job) => job.status === JOB_STATUS.PENDING) ?? null;

    if (strategy === "skip" || strategy === "replace") {
      return pending;
    }

    return pending ?? matchingJobs[0] ?? null;
  }

  private filterByDeduplicationKey(
    jobs: DeduplicationCandidate[],
    deduplicationKey?: string,
  ): DeduplicationCandidate[] {
    if (!deduplicationKey) {
      return jobs;
    }

    return jobs.filter((job) => {
      const metadata = deduplicatedJobMetadataSchema.safeParse(job.metadata);
      return (
        metadata.success && metadata.data.deduplicationKey === deduplicationKey
      );
    });
  }
}
