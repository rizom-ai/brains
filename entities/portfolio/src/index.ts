/**
 * Portfolio package.
 *
 * One entity: a project case study. No configuration, so this is an entity
 * package rather than a service one.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/plugins";
import { project } from "./project-entity";

const portfolioPackage: EntityPackageDefinition<
  readonly [typeof project],
  readonly []
> = defineEntityPackage({ id: "portfolio", entities: [project] });

export default portfolioPackage;

export { project } from "./project-entity";
export { projectGeneration } from "./handlers/generation-handler";

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

export {
  buildProjectAtprotoRecord,
  createProjectAtprotoProjection,
} from "./atproto-projection";

// DataSource
export { projectDataSource } from "./datasources/project-datasource";

// Templates
export { ProjectListTemplate } from "./templates/project-list";
export { ProjectDetailTemplate } from "./templates/project-detail";
export { projectGenerationTemplate } from "./templates/generation-template";

// Job Handler
export { ProjectGenerationJobHandler } from "./handlers/generation-handler";
