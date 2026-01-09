import type {
  PluginTool,
  ToolResponse,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";

const inputSchema = z.object({
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Filter to specific entity types (e.g., ['post', 'link'])"),
  limit: z.number().default(50).describe("Maximum entities to process"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview entities without queueing jobs"),
});

// Input type is inferred inside handler via inputSchema.parse()

/**
 * Get entity types that should be processed for topic extraction
 */
function getExtractableEntityTypes(context: ServicePluginContext): string[] {
  const allTypes = context.entityService.getEntityTypes();
  // Exclude topic itself to prevent recursion
  return allTypes.filter((type) => type !== "topic");
}

/**
 * Create batch-extract tool with context
 */
export function createBatchExtractTool(
  context: ServicePluginContext,
): PluginTool {
  return {
    name: "batch-extract",
    description:
      "Extract topics from entities that need processing (new or changed content)",
    inputSchema: inputSchema.shape,
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      const parsed = inputSchema.parse(input);

      // 1. Get all topics and extract processed contentHashes
      const topics = await context.entityService.listEntities("topic");
      const processedHashes = new Set<string>();

      for (const topic of topics) {
        // Topics store body data including sources
        // The TopicAdapter stores sources in the markdown body
        const metadata = topic.metadata as {
          sources?: Array<{ contentHash?: string }>;
        };
        if (metadata.sources) {
          for (const source of metadata.sources) {
            if (source.contentHash) {
              processedHashes.add(source.contentHash);
            }
          }
        }
      }

      // 2. Get entities and filter to unprocessed
      const entityTypes =
        parsed.entityTypes ?? getExtractableEntityTypes(context);
      const unprocessed: Array<{
        id: string;
        type: string;
        contentHash: string;
      }> = [];

      for (const type of entityTypes) {
        if (type === "topic") continue; // Skip topics

        const entities = await context.entityService.listEntities(type);
        for (const entity of entities) {
          // Skip drafts
          const status = (entity.metadata as Record<string, unknown>)["status"];
          if (status === "draft") continue;

          if (!processedHashes.has(entity.contentHash)) {
            unprocessed.push({
              id: entity.id,
              type: entity.entityType,
              contentHash: entity.contentHash,
            });
          }
        }
      }

      // 3. Apply limit
      const toProcess = unprocessed.slice(0, parsed.limit);

      // 4. dryRun mode - just return preview
      if (parsed.dryRun) {
        return {
          status: "success",
          message: `Found ${unprocessed.length} entities needing extraction`,
          data: {
            total: unprocessed.length,
            preview: toProcess.map((e) => ({ id: e.id, type: e.type })),
          },
        };
      }

      // 5. Queue extraction jobs
      for (const entity of toProcess) {
        const fullEntity = await context.entityService.getEntity(
          entity.type,
          entity.id,
        );
        if (!fullEntity) continue;

        await context.enqueueJob(
          "extract",
          {
            entityId: fullEntity.id,
            entityType: fullEntity.entityType,
            entityContent: fullEntity.content,
            entityMetadata: fullEntity.metadata,
            entityCreated: fullEntity.created,
            entityUpdated: fullEntity.updated,
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
              operationTarget: `topic-extraction:${fullEntity.entityType}:${fullEntity.id}`,
              pluginId: "topics",
            },
          },
        );
      }

      return {
        status: "success",
        message: `Queued ${toProcess.length} extraction jobs`,
        data: {
          total: unprocessed.length,
          queued: toProcess.length,
        },
      };
    },
  };
}
