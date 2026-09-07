import { studioService } from "./service";

// The operator's console: every entity type edited as the person using it,
// and every workspace other packages declare, hosted in one place.
export { studioService, type StudioDeps, type StudioState } from "./service";
export {
  studioConfigSchema,
  type StudioConfig,
  type StudioConfigInput,
} from "./config";
export { renderEditorShellHtml } from "./editor-shell";
export {
  STUDIO_OVERVIEW_WORKSPACE_ID,
  STUDIO_OVERVIEW_REFRESH_MS,
} from "./overview-workspace";

/** Studio as a brain composes it. */
const studioPackage: ReturnType<typeof studioService> = studioService();
export default studioPackage;
