// With moduleResolution: "bundler", we can export implementations safely
export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
export { BaseEntityFormatter } from "./base-entity-formatter";
export { BaseEntityAdapter } from "./adapters";

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
