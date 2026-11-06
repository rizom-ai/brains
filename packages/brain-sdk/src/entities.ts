/** Declarative public entity authoring surface. */

export { z } from "@brains/utils/zod";
export {
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  defineProjection,
} from "@brains/plugins";
export type {
  AttachmentProvider,
  DataSourceDefinition,
  DataSourceEntityReader,
  EncodedEntityMarkdown,
  EntityAttachmentDeclaration,
  EntityCreateAttachment,
  EntityCreateCheck,
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityCreateUploadReader,
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
  MediaAttachmentContext,
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
