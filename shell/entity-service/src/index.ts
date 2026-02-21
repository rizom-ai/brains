export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
export { BaseEntityFormatter } from "./base-entity-formatter";
export { BaseEntityAdapter } from "./adapters";
export { SingletonEntityService } from "./singleton-entity-service";

export type {
  BaseEntity,
  EntityInput,
  SearchResult,
  EntityAdapter,
  ListOptions,
  SearchOptions,
  EntityRegistry as IEntityRegistry,
  EntityService as IEntityService,
  ICoreEntityService,
  EntityDbConfig,
  EntityTypeConfig,
} from "./types";

export { baseEntitySchema } from "./types";

export {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  type FrontmatterConfig,
} from "./frontmatter";

export { FrontmatterContentHelper } from "./frontmatter-content-helper";
