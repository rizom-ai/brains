/** Declarative service authoring contract. */

export {
  defineAccountSettings,
  defineCmsWorkspace,
  defineDashboardWidget,
  defineEntityCatalog,
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
  CmsWorkspaceView,
  CmsWorkspaceViewBlock,
  DashboardDigest,
  DashboardOperatorView,
  DashboardOperatorViewBlock,
  DashboardWidgetDefinition,
  OperatorCaller,
  OperatorCapabilityDefinition,
  OperatorEntityCatalogDefinition,
  OperatorEntityReader,
  OperatorQueryReader,
  OperatorView,
  OperatorViewBlock,
  ServiceJobDefinition,
  ServiceJobReference,
  ServiceJobStatus,
  ServicePackageDefinition,
  WorkspaceActionConfirmation,
  WorkspaceActionDefinition,
  WorkspacePreparedConfirmation,
} from "@brains/plugins";
export { z } from "@brains/utils/zod";
