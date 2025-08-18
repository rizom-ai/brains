import type { JobContext } from "@brains/job-queue";

/**
 * Create a system context for background operations
 */
export const createSystemContext = (
  operationType: JobContext["operationType"] = "data_processing",
): JobContext => ({
  interfaceType: "system",
  userId: "system",
  operationType,
});