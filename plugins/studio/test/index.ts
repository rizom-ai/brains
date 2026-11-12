/** Backend test support for application-level integration suites. */
export {
  createStudioPlugins,
  installStudioGroupings,
  studioContextOn,
  studioPlugin,
  type StudioPlugin,
} from "./studio-plugins";
export type { GroupingDefinitionSource } from "../src/grouping-definition-source";
export type { GroupingDefinitionsFrontmatter } from "../src/grouping-definitions-contract";
export { createEditorRoutes } from "../src/editor-routes";
export { StudioWorkspaceRegistry } from "../src/workspace-registry";
