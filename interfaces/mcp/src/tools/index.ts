import type { PluginTool, InterfacePluginContext } from "@brains/plugins";
import { z } from "zod";

/**
 * Create MCP interface tools
 * Returns standard PluginTool array like other plugins
 *
 * @param pluginId - The plugin ID (typically "mcp")
 * @param getContext - Function to get the interface plugin context
 */
export function createMCPTools(
  pluginId: string,
  getContext: () => InterfacePluginContext | undefined,
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

        const context = getContext();
        if (!context) {
          throw new Error("Plugin context not initialized");
        }

        const result = await context.query(parsed.query, {
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

        const context = getContext();
        if (!context) {
          throw new Error("Plugin context not initialized");
        }

        const results = await context.entityService.search(parsed.query, {
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

        const context = getContext();
        if (!context) {
          throw new Error("Plugin context not initialized");
        }

        const entity = await context.entityService.getEntity(
          parsed.entityType,
          parsed.id,
        );
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

        const context = getContext();
        if (!context) {
          throw new Error("Plugin context not initialized");
        }

        if (parsed.batchId) {
          // Check specific batch
          const status = await context.getBatchStatus(parsed.batchId);

          if (!status) {
            return {
              error: "Batch not found",
              message: `No batch found with ID: ${parsed.batchId}`,
            };
          }

          const percentComplete =
            status.totalOperations > 0
              ? Math.round(
                  (status.completedOperations / status.totalOperations) * 100,
                )
              : 0;

          return {
            batchId: parsed.batchId,
            status: status.status,
            progress: {
              total: status.totalOperations,
              completed: status.completedOperations,
              failed: status.failedOperations,
              percentComplete,
            },
            currentOperation: status.currentOperation,
            errors: status.errors,
            message:
              status.status === "processing"
                ? `Processing: ${status.completedOperations}/${status.totalOperations} operations (${percentComplete}%)`
                : status.status === "completed"
                  ? `Completed: ${status.completedOperations} operations`
                  : status.status === "failed"
                    ? `Failed: ${status.failedOperations} operations failed`
                    : "Unknown status",
          };
        } else {
          // Show all active operations
          const activeJobs = await context.getActiveJobs(parsed.jobTypes);
          const activeBatches = await context.getActiveBatches();

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
                ? `Use ${pluginId}:check-job-status --batchId <id> to check specific batch progress`
                : undefined,
          };
        }
      },
    },
  ];
}
