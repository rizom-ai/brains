import type {
  PluginTool,
  ToolResponse,
  ToolContext,
  ServicePluginContext,
  BaseEntity,
} from "@brains/plugins";
import { z } from "@brains/utils";

const inputSchema = z.object({
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Filter to specific entity types (e.g., ['post', 'link'])"),
  limit: z.number().optional().describe("Maximum entities to process"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview entities without queueing jobs"),
  force: z
    .boolean()
    .default(false)
    .describe("Force extraction on all entities, even if already processed"),
});

export interface ExtractOptions {
  entityTypes?: string[] | undefined;
  limit?: number | undefined;
  force?: boolean | undefined;
}

/**
 * Create batch-extract tool with context
 */
export function createBatchExtractTool(
  context: ServicePluginContext,
  getEntitiesToExtract: (options?: ExtractOptions) => Promise<BaseEntity[]>,
): PluginTool {
  return {
    name: "topics_batch-extract",
    description:
      "Extract topics from entities that need processing (new or changed content)",
    inputSchema: inputSchema.shape,
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      const parsed = inputSchema.parse(input);

      // Get entities to extract using plugin method
      const toExtract = await getEntitiesToExtract({
        entityTypes:
          parsed.entityTypes && parsed.entityTypes.length > 0
            ? parsed.entityTypes
            : undefined,
        limit: parsed.limit,
        force: parsed.force,
      });

      // dryRun mode - just return preview
      if (parsed.dryRun) {
        return {
          status: "success",
          message: `Found ${toExtract.length} entities for extraction`,
          data: {
            total: toExtract.length,
            preview: toExtract.map((e) => ({ id: e.id, type: e.entityType })),
          },
        };
      }

      // Queue extraction jobs
      for (const entity of toExtract) {
        await context.enqueueJob(
          "extract",
          {
            entityId: entity.id,
            entityType: entity.entityType,
            entityContent: entity.content,
            entityMetadata: entity.metadata,
            entityCreated: entity.created,
            entityUpdated: entity.updated,
            minRelevanceScore: 0.6,
            autoMerge: true,
            mergeSimilarityThreshold: 0.85,
          },
          null,
          {
            priority: 5,
            source: "topics-plugin",
            metadata: {
              operationType: "data_processing" as const,
              operationTarget: `topic-extraction:${entity.entityType}:${entity.id}`,
              pluginId: "topics",
            },
          },
        );
      }

      return {
        status: "success",
        message: `Queued ${toExtract.length} extraction jobs`,
        data: {
          total: toExtract.length,
          queued: toExtract.length,
        },
      };
    },
  };
}
