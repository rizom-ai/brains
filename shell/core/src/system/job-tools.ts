import type { Tool } from "@brains/mcp-service";
import type { SystemServices } from "./types";
import { jobStatusInputSchema } from "./schemas";
import { createSystemTool } from "./tool-helpers";

export function createJobTools(services: SystemServices): Tool[] {
  const { jobs } = services;

  return [
    createSystemTool(
      "job_status",
      "Inspect runtime job status for ready checks only when the prior operation created a job, or for status disputes. With a known batch ID, pass batchId. Without an ID, call this tool with no arguments to list active jobs and batches; do not ask the user for an ID first. Do not argue from the transcript alone.",
      jobStatusInputSchema,
      async (input) => {
        if (input.batchId) {
          const batch = await jobs.getBatchStatus(input.batchId);
          if (!batch) {
            return {
              success: false,
              error: `No batch found with ID: ${input.batchId}`,
            };
          }
          const pct =
            batch.totalOperations > 0
              ? Math.round(
                  (batch.completedOperations / batch.totalOperations) * 100,
                )
              : 0;
          return {
            success: true,
            data: {
              batchId: input.batchId,
              status: batch.status,
              progress: {
                total: batch.totalOperations,
                completed: batch.completedOperations,
                failed: batch.failedOperations,
                percentComplete: pct,
              },
              currentOperation: batch.currentOperation,
              errors: batch.errors,
            },
          };
        }

        const activeJobs = await jobs.getActiveJobs(input.jobTypes);
        const activeBatches = await jobs.getActiveBatches();
        return {
          success: true,
          data: {
            summary: {
              activeJobs: activeJobs.length,
              activeBatches: activeBatches.length,
            },
            jobs: activeJobs.map((j) => ({
              id: j.id,
              type: j.type,
              status: j.status,
              priority: j.priority,
              retryCount: j.retryCount,
              createdAt: new Date(j.createdAt).toISOString(),
              startedAt: j.startedAt
                ? new Date(j.startedAt).toISOString()
                : null,
            })),
            batches: activeBatches.map((b) => ({
              batchId: b.batchId,
              status: b.status.status,
              totalOperations: b.status.totalOperations,
              completedOperations: b.status.completedOperations,
              failedOperations: b.status.failedOperations,
              currentOperation: b.status.currentOperation,
              pluginId: b.metadata.metadata.pluginId,
              errors: b.status.errors,
            })),
          },
        };
      },
      { visibility: "public", sideEffects: "none" },
    ),
  ];
}
