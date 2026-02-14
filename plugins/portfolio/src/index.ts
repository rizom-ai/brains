// Plugin and factory
export { PortfolioPlugin, portfolioPlugin } from "./plugin";

// Config
export type { PortfolioConfig, PortfolioConfigInput } from "./config";
export { portfolioConfigSchema } from "./config";

// Schemas
export type {
  Project,
  ProjectStatus,
  ProjectFrontmatter,
  ProjectMetadata,
  ProjectContent,
  ProjectWithData,
  EnrichedProject,
} from "./schemas/project";
export {
  projectSchema,
  projectStatusSchema,
  projectFrontmatterSchema,
  projectMetadataSchema,
  projectContentSchema,
  projectWithDataSchema,
  enrichedProjectSchema,
  templateProjectSchema,
} from "./schemas/project";

// Adapter
export { ProjectAdapter, projectAdapter } from "./adapters/project-adapter";

// DataSource
export { ProjectDataSource } from "./datasources/project-datasource";

// Tools
export { createPortfolioTools } from "./tools";

// Templates
export { ProjectListTemplate } from "./templates/project-list";
export { ProjectDetailTemplate } from "./templates/project-detail";
export { projectGenerationTemplate } from "./templates/generation-template";

// Job Handler
export { ProjectGenerationJobHandler } from "./handlers/generation-handler";
