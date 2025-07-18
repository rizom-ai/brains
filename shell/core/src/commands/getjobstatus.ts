import type {
  Command,
  CommandContext,
  CommandResponse,
} from "@brains/command-registry";
import type { Shell } from "../shell";
import type { JobQueueService, BatchJobManager } from "@brains/job-queue";

export function createGetJobStatusCommand(shell: Shell): Command {
  return {
    name: "getjobstatus",
    description: "Check the status of background operations",
    usage: "/getjobstatus [batch-id]",
    handler: async (
      args: string[],
      _context: CommandContext,
    ): Promise<CommandResponse> => {
      const batchId = args[0];
      const jobQueueService = shell
        .getServiceRegistry()
        .resolve("jobQueueService") as JobQueueService;
      const batchManager = shell
        .getServiceRegistry()
        .resolve("batchJobManager") as BatchJobManager;

      try {
        if (batchId) {
          // Check specific batch
          const status = await batchManager.getBatchStatus(batchId);

          if (!status) {
            return {
              type: "message",
              message: `Batch not found: ${batchId}`,
            };
          }

          const percentComplete =
            status.totalOperations > 0
              ? Math.round(
                  (status.completedOperations / status.totalOperations) * 100,
                )
              : 0;

          return {
            type: "message",
            message: [
              `Batch ID: ${status.batchId}`,
              `Status: ${status.status}`,
              `Progress: ${percentComplete}% (${status.completedOperations}/${status.totalOperations})`,
              `Failed: ${status.failedOperations}`,
            ].join("\n"),
          };
        } else {
          // List all active operations
          const activeJobs = await jobQueueService.getActiveJobs();
          const activeBatches = await batchManager.getActiveBatches();

          const formattedJobs = activeJobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            priority:
              (job.metadata as { priority?: string })?.priority ?? "normal",
          }));

          const formattedBatches = activeBatches.map((batch) => ({
            batchId: batch.batchId,
            totalOperations: batch.status.totalOperations,
            completedOperations: batch.status.completedOperations,
            failedOperations: batch.status.failedOperations,
            status: batch.status.status,
            percentComplete:
              batch.status.totalOperations > 0
                ? Math.round(
                    (batch.status.completedOperations /
                      batch.status.totalOperations) *
                      100,
                  )
                : 0,
          }));

          const sections = [];

          if (formattedJobs.length > 0) {
            sections.push("Active Jobs:");
            formattedJobs.forEach((job) => {
              sections.push(`  ${job.id} - ${job.type} (${job.status})`);
            });
          }

          if (formattedBatches.length > 0) {
            if (sections.length > 0) sections.push("");
            sections.push("Active Batches:");
            formattedBatches.forEach((batch) => {
              sections.push(
                `  ${batch.batchId} - ${batch.percentComplete}% complete (${batch.completedOperations}/${batch.totalOperations})`,
              );
            });
            sections.push("");
            sections.push(
              "Tip: Use /getjobstatus <batch-id> to check specific batch progress",
            );
          }

          if (sections.length === 0) {
            return {
              type: "message",
              message: "No active operations",
            };
          }

          return {
            type: "message",
            message: sections.join("\n"),
          };
        }
      } catch (error) {
        return {
          type: "message",
          message: `Error getting job status: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
