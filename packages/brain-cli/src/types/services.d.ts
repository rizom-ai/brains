import type { z } from "zod";
import type { DataSource, BaseDataSourceContext, BaseEntity } from "./entities";
import type { ApiRouteDefinition, WebRouteDefinition } from "./interfaces";

export interface BaseQuery {
  id?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}
export type SortField = string;
export interface NavigationResult {
  items: unknown[];
  [key: string]: unknown;
}
export interface EntityDataSourceConfig {
  id: string;
  entityType: string;
  name?: string;
}
export class BaseEntityDataSource<
  TQuery extends BaseQuery = BaseQuery,
  TResult = unknown,
> implements DataSource<TQuery, TResult> {
  readonly id: string;
  readonly entityType: string;
  readonly name?: string;
  constructor(config: EntityDataSourceConfig);
  fetch(query?: TQuery, context?: BaseDataSourceContext): Promise<TResult>;
}
export const baseQuerySchema: z.ZodSchema<BaseQuery>;
export const baseInputSchema: z.ZodSchema<unknown>;

export interface JobContext {
  jobId: string;
  rootJobId?: string;
  [key: string]: unknown;
}
export interface JobOptions {
  priority?: number;
  delay?: number;
  [key: string]: unknown;
}
export interface JobInfo {
  id: string;
  type: string;
  status: string;
  [key: string]: unknown;
}
export interface JobProgressEvent {
  jobId: string;
  progress?: number;
  total?: number;
  message?: string;
  status?: string;
}
export interface JobHandler<TData = unknown, TResult = unknown> {
  process(data: TData, context: JobContext): Promise<TResult>;
  validateAndParse?(data: unknown): TData | null;
  onError?(
    error: Error,
    data: TData,
    context: JobContext,
  ): Promise<void> | void;
}
export class BaseJobHandler<
  TData = unknown,
  TResult = unknown,
> implements JobHandler<TData, TResult> {
  process(data: TData, context: JobContext): Promise<TResult>;
  validateAndParse?(data: unknown): TData | null;
}
export const JobProgressEventSchema: z.ZodSchema<JobProgressEvent>;

export interface GenerationJobHandlerConfig {
  entityType: string;
  templateName?: string;
}
export interface GeneratedContent<TEntity extends BaseEntity = BaseEntity> {
  entity: TEntity;
  content: string;
  metadata?: Record<string, unknown>;
}
export class BaseGenerationJobHandler<
  TData = unknown,
  TEntity extends BaseEntity = BaseEntity,
> extends BaseJobHandler<TData, GeneratedContent<TEntity>> {
  constructor(config: GenerationJobHandlerConfig);
}

export interface BatchOperation {
  type: string;
  data: unknown;
  options?: JobOptions;
}
export interface Batch {
  id: string;
  operations: BatchOperation[];
}
export interface BatchJobStatus {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
}

export function ensureUniqueTitle(args: {
  entityType: string;
  title: string;
  entityService: unknown;
  ai?: unknown;
  regeneratePrompt?: string;
}): Promise<string>;

export type { ApiRouteDefinition, WebRouteDefinition };
