/** Declarative public entity authoring surface. */

export { z } from "@brains/utils/zod";
export {
  defineEntity,
  defineEntityPackage,
  defineProjection,
} from "@brains/plugins";
export type {
  EncodedEntityMarkdown,
  EntityDefinition,
  EntityMarkdownCodec,
  EntityMarkdownDocument,
  EntityOf,
  EntityPackageDefinition,
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
