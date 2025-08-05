import type { PluginTool } from "@brains/plugins";
import type { SystemPlugin } from "../plugin";
import { z } from "zod";

export function createSystemTools(
  plugin: SystemPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}:query`,
      description: "Query the knowledge base using AI-powered search",
      inputSchema: {
        query: z
          .string()
          .describe("Natural language query to search the knowledge base"),
        userId: z.string().optional().describe("Optional user ID for context"),
      },
      visibility: "public",
      handler: async (input): Promise<unknown> => {
        const parsed = z
          .object({
            query: z.string(),
            userId: z.string().optional(),
          })
          .parse(input);

        const result = await plugin.query(parsed.query, {
          userId: parsed.userId,
        });
        return result;
      },
    },
    {
      name: `${pluginId}:search`,
      description: "Search entities by type and query",
      inputSchema: {
        entityType: z
          .string()
          .describe("Type of entity to search (e.g., 'note', 'base')"),
        query: z.string().describe("Search query"),
        limit: z.number().optional().describe("Maximum number of results"),
      },
      visibility: "public",
      handler: async (input): Promise<unknown> => {
        const parsed = z
          .object({
            entityType: z.string(),
            query: z.string(),
            limit: z.number().optional(),
          })
          .parse(input);

        const results = await plugin.searchEntities(parsed.query, {
          types: [parsed.entityType],
          limit: parsed.limit ?? 10,
        });
        return results;
      },
    },
    {
      name: `${pluginId}:get`,
      description: "Get a specific entity by type and ID",
      inputSchema: {
        entityType: z.string().describe("Type of entity"),
        id: z.string().describe("Entity ID"),
      },
      visibility: "public",
      handler: async (input): Promise<unknown> => {
        const parsed = z
          .object({
            entityType: z.string(),
            id: z.string(),
          })
          .parse(input);

        const entity = await plugin.getEntity(parsed.entityType, parsed.id);
        return entity ?? { error: "Entity not found" };
      },
    },
    {
      name: `${pluginId}:check-job-status`,
      description: "Check the status of background operations",
      inputSchema: {
        batchId: z
          .string()
          .optional()
          .describe(
            "Specific batch ID to check (leave empty for all active operations)",
          ),
        jobTypes: z
          .array(z.string())
          .optional()
          .describe(
            "Filter by specific job types (only when batchId is not provided)",
          ),
      },
      visibility: "public",
      handler: async (input): Promise<unknown> => {
        const parsed = z
          .object({
            batchId: z.string().optional(),
            jobTypes: z.array(z.string()).optional(),
          })
          .parse(input);

        const status = await plugin.getJobStatus(
          parsed.batchId,
          parsed.jobTypes,
        );

        if (parsed.batchId) {
          // Specific batch
          if (!status.batch) {
            return {
              error: "Batch not found",
              message: `No batch found with ID: ${parsed.batchId}`,
            };
          }

          const percentComplete =
            status.batch.totalOperations > 0
              ? Math.round(
                  (status.batch.completedOperations /
                    status.batch.totalOperations) *
                    100,
                )
              : 0;

          return {
            batchId: parsed.batchId,
            status: status.batch.status,
            progress: {
              total: status.batch.totalOperations,
              completed: status.batch.completedOperations,
              failed: status.batch.failedOperations,
              percentComplete,
            },
            currentOperation: status.batch.currentOperation,
            errors: status.batch.errors,
            message:
              status.batch.status === "processing"
                ? `Processing: ${status.batch.completedOperations}/${status.batch.totalOperations} operations (${percentComplete}%)`
                : status.batch.status === "completed"
                  ? `Completed: ${status.batch.completedOperations} operations`
                  : status.batch.status === "failed"
                    ? `Failed: ${status.batch.failedOperations} operations failed`
                    : "Unknown status",
          };
        } else {
          // All active operations
          const activeJobs = status.activeJobs || [];
          const activeBatches = status.activeBatches || [];

          // Format individual jobs
          const formattedJobs = activeJobs.map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status,
            priority: job.priority,
            retryCount: job.retryCount,
            createdAt: new Date(job.createdAt).toISOString(),
            startedAt: job.startedAt
              ? new Date(job.startedAt).toISOString()
              : null,
          }));

          // Format batch operations
          const formattedBatches = activeBatches.map((batch) => ({
            batchId: batch.batchId,
            status: batch.status.status,
            totalOperations: batch.status.totalOperations,
            completedOperations: batch.status.completedOperations,
            failedOperations: batch.status.failedOperations,
            currentOperation: batch.status.currentOperation,
            userId: batch.metadata.metadata.userId,
            errors: batch.status.errors,
          }));

          return {
            summary: {
              activeJobs: formattedJobs.length,
              activeBatches: formattedBatches.length,
            },
            jobs: formattedJobs,
            batches: formattedBatches,
            tip:
              formattedBatches.length > 0
                ? `Use ${pluginId}:check-job-status with batchId to check specific batch progress`
                : undefined,
          };
        }
      },
    },
  ];
}
