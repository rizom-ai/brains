import { createStudioPackage } from "./plugin";

export {
  createStudioPackage,
  studioPluginConfigSchema,
  type StudioPluginConfigInput,
} from "./plugin";
export { renderEditorShellHtml } from "./editor-shell";
export { studioTypeHierarchy, zodFieldToStudioWidget } from "./config";
export {
  STUDIO_OVERVIEW_WORKSPACE_ID,
  STUDIO_OVERVIEW_REFRESH_MS,
} from "./overview-workspace";
export { groupingDefinitionsEntity } from "./entity/grouping-definitions-entity";

/** Studio, as a brain composes it: the editor and the type it owns. */
const studioPackage: ReturnType<typeof createStudioPackage> =
  createStudioPackage();
export default studioPackage;
