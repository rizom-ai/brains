// With moduleResolution: "bundler", we can export implementations safely
export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
export { BaseEntityFormatter } from "./base-entity-formatter";
export { BaseEntityAdapter } from "./adapters";
export { SingletonEntityService } from "./singleton-entity-service";

// Export types
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

// Export schemas
export { baseEntitySchema } from "./types";

// Export frontmatter utilities
export {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  type FrontmatterConfig,
} from "./frontmatter";

// Export frontmatter content helper
export { FrontmatterContentHelper } from "./frontmatter-content-helper";
