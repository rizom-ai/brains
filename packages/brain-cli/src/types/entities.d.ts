import type { z } from "zod";

export interface BaseEntity {
  id: string;
  entityType: string;
  content: string;
  created: string;
  updated: string;
  metadata: Record<string, unknown>;
  contentHash?: string;
}
export type EntityInput<T extends BaseEntity = BaseEntity> = Omit<
  T,
  "created" | "updated" | "contentHash"
> &
  Partial<Pick<T, "created" | "updated" | "contentHash">>;
export interface EntityMutationResult {
  entityId: string;
  jobId: string;
}
export interface CreateInput {
  entityType: string;
  title?: string;
  content?: string;
  prompt?: string;
  url?: string;
  [key: string]: unknown;
}
export interface CreateExecutionContext {
  interfaceType?: string;
  userId?: string;
  channelId?: string;
  [key: string]: unknown;
}
export interface CreateResult {
  entityId: string;
  jobId?: string;
  entityType: string;
}
export type CreateInterceptionResult =
  | { kind: "continue"; input: CreateInput }
  | { kind: "handled"; result: CreateResult };
export type CreateInterceptor = (
  input: CreateInput,
  context: CreateExecutionContext,
) => Promise<CreateInterceptionResult> | CreateInterceptionResult;

export interface EntityAdapter<TEntity extends BaseEntity = BaseEntity> {
  entityType: string;
  schema: z.ZodSchema<TEntity>;
  frontmatterSchema?: z.ZodTypeAny;
  toMarkdown(entity: TEntity): string;
  fromMarkdown(markdown: string, id?: string): TEntity;
}
export interface EntityTypeConfig {
  embeddable?: boolean;
  weight?: number;
  [key: string]: unknown;
}
export class BaseEntityAdapter<
  TEntity extends BaseEntity = BaseEntity,
> implements EntityAdapter<TEntity> {
  readonly entityType: string;
  readonly schema: z.ZodSchema<TEntity>;
  readonly frontmatterSchema?: z.ZodTypeAny;
  constructor(config: {
    entityType: string;
    schema: z.ZodSchema<TEntity>;
    frontmatterSchema?: z.ZodTypeAny;
  });
  toMarkdown(entity: TEntity): string;
  fromMarkdown(markdown: string, id?: string): TEntity;
}
export const baseEntitySchema: z.ZodSchema<BaseEntity>;
export const BASE_ENTITY_TYPE: "base";

export interface SearchResult<TEntity extends BaseEntity = BaseEntity> {
  entity: TEntity;
  score: number;
  excerpt?: string;
}
export interface ListOptions {
  limit?: number;
  offset?: number;
  publishedOnly?: boolean;
  [key: string]: unknown;
}
export interface SearchOptions extends ListOptions {
  entityType?: string;
}

export interface DataSourceCapabilities {
  list?: boolean;
  get?: boolean;
  search?: boolean;
  generate?: boolean;
  transform?: boolean;
}
export interface BaseDataSourceContext {
  entityService?: unknown;
  [key: string]: unknown;
}
export interface DataSource<TQuery = unknown, TResult = unknown> {
  id: string;
  name?: string;
  capabilities?: DataSourceCapabilities;
  fetch(query?: TQuery, context?: BaseDataSourceContext): Promise<TResult>;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
export interface PaginateOptions {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}
export interface PaginateResult<T> {
  items: T[];
  pagination: PaginationInfo;
}
export const paginationInfoSchema: z.ZodSchema<PaginationInfo>;
export function paginateItems<T>(
  items: T[],
  options?: PaginateOptions,
): PaginateResult<T>;
export function buildPaginationInfo(
  totalItems: number,
  options?: PaginateOptions,
): PaginationInfo;

export interface FrontmatterConfig {
  includeFields?: string[];
  excludeFields?: string[];
}
export function generateMarkdownWithFrontmatter(
  content: string,
  metadata?: Record<string, unknown>,
  config?: FrontmatterConfig,
): string;
export function parseMarkdownWithFrontmatter(markdown: string): {
  content: string;
  metadata: Record<string, unknown>;
};
export function generateFrontmatter(
  metadata: Record<string, unknown>,
  config?: FrontmatterConfig,
): string;
