/** Curated public entity authoring surface. */

export {
  BaseEntityAdapter,
  baseEntitySchema,
  BASE_ENTITY_TYPE,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  paginationInfoSchema,
  paginateItems,
  buildPaginationInfo,
} from "@brains/entity-service";

export type {
  BaseEntity,
  EntityInput,
  CreateInput,
  CreateExecutionContext,
  CreateResult,
  CreateInterceptionResult,
  CreateInterceptor,
  EntityAdapter,
  EntityTypeConfig,
  EntityMutationResult,
  SearchResult,
  ListOptions,
  SearchOptions,
  DataSource,
  DataSourceCapabilities,
  BaseDataSourceContext,
  PaginationInfo,
  PaginateOptions,
  PaginateResult,
  FrontmatterConfig,
} from "@brains/entity-service";
