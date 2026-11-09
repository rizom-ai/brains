import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { portfolioConfigSchema } from "./config";
import { projectDataSource } from "./datasources/project-datasource";
import { project } from "./project";

/**
 * The portfolio: one entity, a project or case study, rendered by the
 * project templates through the portfolio data source.
 */
export const portfolioPackage: EntityPackageDefinition<
  readonly [typeof project],
  readonly [],
  typeof portfolioConfigSchema
> = defineEntityPackage({
  id: "portfolio",
  config: portfolioConfigSchema,
  entities: [project],
  dataSources: [projectDataSource(project)],
});

export default portfolioPackage;

export { project } from "./project";

// Config
export {
  portfolioConfigSchema,
  type PortfolioConfig,
  type PortfolioConfigInput,
} from "./config";

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

export {
  buildProjectAtprotoRecord,
  projectAtproto,
} from "./atproto-projection";

// Templates
export { ProjectListTemplate } from "./templates/project-list";
export { ProjectDetailTemplate } from "./templates/project-detail";
export { projectGenerationTemplate } from "./templates/generation-template";

export { projectGeneration } from "./handlers/generation-handler";
