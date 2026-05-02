import type { DeduplicationStrategy } from "./schema/types";
import { JOB_STATUS } from "./schemas";
import type { JobInfo } from "./types";

type MetadataWithDeduplicationKey = JobInfo["metadata"] & {
  deduplicationKey?: string;
};

/**
 * Applies queue deduplication policy to active jobs of a single type.
 */
export class JobDeduplicator {
  public findDuplicate(
    activeJobs: JobInfo[],
    strategy?: DeduplicationStrategy,
    deduplicationKey?: string,
  ): JobInfo | null {
    if (!strategy || strategy === "none") {
      return null;
    }

    const matchingJobs = this.filterByDeduplicationKey(
      activeJobs,
      deduplicationKey,
    );
    if (matchingJobs.length === 0) {
      return null;
    }

    if (strategy === "skip" || strategy === "replace") {
      return (
        matchingJobs.find((job) => job.status === JOB_STATUS.PENDING) ?? null
      );
    }

    return matchingJobs[0] ?? null;
  }

  private filterByDeduplicationKey(
    jobs: JobInfo[],
    deduplicationKey?: string,
  ): JobInfo[] {
    if (!deduplicationKey) {
      return jobs;
    }

    return jobs.filter((job) => {
      const metadata = job.metadata as MetadataWithDeduplicationKey;
      return metadata.deduplicationKey === deduplicationKey;
    });
  }
}
