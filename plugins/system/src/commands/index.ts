import type { Command, CommandResponse } from "@brains/plugins";
import type { SystemPlugin } from "../plugin";

export function createSystemCommands(
  plugin: SystemPlugin,
  _pluginId: string,
): Command[] {
  return [
    {
      name: "search",
      description: "Search your knowledge base",
      usage: "/search <query>",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message: "Please provide a search query. Usage: /search <query>",
          };
        }

        const searchQuery = args.join(" ");

        try {
          const searchResults = await plugin.searchEntities(searchQuery, {
            limit: 5,
            sortBy: "relevance",
          });

          if (searchResults.length === 0) {
            return {
              type: "message",
              message: `No results found for "${searchQuery}"`,
            };
          }

          // Format search results
          const formatted = searchResults
            .map((result) => {
              const entity = result.entity;
              const preview =
                entity.content.substring(0, 200) +
                (entity.content.length > 200 ? "..." : "");

              return [
                `**${entity.metadata?.["title"] ?? entity.id}**`,
                `Type: ${entity.entityType} | Score: ${result.score.toFixed(2)}`,
                ``,
                preview,
              ].join("\n");
            })
            .join("\n\n---\n\n");

          return {
            type: "message",
            message: `Found ${searchResults.length} results for "${searchQuery}":\n\n${formatted}`,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error searching entities: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "get",
      description: "Get a specific entity by ID",
      usage: "/get <entity-id> [entity-type]",
      handler: async (args, _context): Promise<CommandResponse> => {
        if (args.length === 0) {
          return {
            type: "message",
            message:
              "Please provide an entity ID. Usage: /get <entity-id> [entity-type]",
          };
        }

        const entityId = args[0] as string;
        const entityType = args[1] ?? "base";

        try {
          const entity = await plugin.getEntity(entityType, entityId);

          if (!entity) {
            return {
              type: "message",
              message: `Entity not found: ${entityId} (type: ${entityType})`,
            };
          }

          // Format entity as a readable string
          const formatted = [
            `ID: ${entity.id}`,
            `Type: ${entity.entityType}`,
            `Title: ${entity.metadata?.["title"] ?? "Untitled"}`,
            `Created: ${new Date(entity.created).toLocaleString()}`,
            `Updated: ${new Date(entity.updated).toLocaleString()}`,
            ``,
            `Content:`,
            entity.content,
          ].join("\n");

          return {
            type: "message",
            message: formatted,
          };
        } catch (error) {
          return {
            type: "message",
            message: `Error getting entity: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
    {
      name: "getjobstatus",
      description: "Check the status of background operations",
      usage: "/getjobstatus [batch-id]",
      handler: async (args, _context): Promise<CommandResponse> => {
        const batchId = args[0];

        try {
          const status = await plugin.getJobStatus(batchId);

          if (batchId) {
            // Specific batch status
            if (!status.batch) {
              return {
                type: "message",
                message: `Batch not found: ${batchId}`,
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
              type: "message",
              message: [
                `Batch ID: ${status.batch.batchId}`,
                `Status: ${status.batch.status}`,
                `Progress: ${percentComplete}% (${status.batch.completedOperations}/${status.batch.totalOperations})`,
                `Failed: ${status.batch.failedOperations}`,
              ].join("\n"),
            };
          } else {
            // All active operations
            const activeJobs = status.activeJobs || [];
            const activeBatches = status.activeBatches || [];

            const formattedJobs = activeJobs.map((job) => ({
              id: job.id,
              type: job.type,
              status: job.status,
              priority:
                job.priority === 0
                  ? "normal"
                  : job.priority === 1
                    ? "high"
                    : "low",
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
    },
  ];
}
