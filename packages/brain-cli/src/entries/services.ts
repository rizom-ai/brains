/** Curated public service plugin authoring surface. */

export {
  BaseEntityDataSource,
  baseQuerySchema,
  baseInputSchema,
  BaseGenerationJobHandler,
  BaseJobHandler,
  JobProgressEventSchema,
  ensureUniqueTitle,
} from "@brains/plugins";

export type {
  EntityDataSourceConfig,
  BaseQuery,
  NavigationResult,
  SortField,
  GenerationJobHandlerConfig,
  GeneratedContent,
  JobHandler,
  JobContext,
  JobOptions,
  JobInfo,
  JobProgressEvent,
  Batch,
  BatchOperation,
  BatchJobStatus,
  ApiRouteDefinition,
  WebRouteDefinition,
} from "@brains/plugins";
