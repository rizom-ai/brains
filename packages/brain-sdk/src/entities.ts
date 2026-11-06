/** Declarative public entity authoring surface. */

export { z } from "@brains/utils/zod";
export {
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  defineProjection,
} from "@brains/plugins";
export type {
  DataSourceDefinition,
  DataSourceEntityReader,
  EncodedEntityMarkdown,
  EntityDataSourceDefinition,
  EntityDefinition,
  EntityDefinitionConfig,
  EntityFeedDeclaration,
  EntityTypeClassification,
  EntityMarkdownCodec,
  EntityMarkdownDocument,
  EntityOf,
  EntityPackageDefinition,
  EntitySeedDefinition,
  EntitySeedTrigger,
  FeedItem,
  ProjectionDefinition,
} from "@brains/plugins";

export type {
  BaseEntity,
  EntityInput,
  EntityMutationResult,
  SearchResult,
  ListOptions,
  SearchOptions,
  PaginationInfo,
  PaginateOptions,
  PaginateResult,
  FrontmatterConfig,
} from "@brains/entity-service";
