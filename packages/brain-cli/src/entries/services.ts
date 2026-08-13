/** Declarative service authoring contract. */

export {
  defineAccountSettings,
  defineCmsWorkspace,
  defineDashboardWidget,
  defineJob,
  defineServicePlugin,
  defineTool,
  defineWorkspaceAction,
} from "@brains/plugins";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsValue,
  CmsWorkspaceDefinition,
  DashboardDigest,
  DashboardWidgetDefinition,
  OperatorCaller,
  OperatorEntityReader,
  OperatorView,
  OperatorViewBlock,
  ServiceJobDefinition,
  ServiceJobReference,
  ServiceJobStatus,
  ServicePackageDefinition,
  WorkspaceActionDefinition,
} from "@brains/plugins";
export { z } from "@brains/utils/zod";
