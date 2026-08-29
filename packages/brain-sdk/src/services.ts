/** Declarative service authoring contract. */

export {
  defineAccountSettings,
  defineStudioWorkspace,
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
  StudioWorkspaceDefinition,
  StudioWorkspaceView,
  StudioWorkspaceViewBlock,
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
  EntityEvalContext,
  ServiceEvalHandler,
  ServiceJobDefinition,
  ServiceJobReference,
  ServiceJobStatus,
  ServicePackageDefinition,
  ServiceToolDefinition,
  WorkspaceActionConfirmation,
  WorkspaceActionDefinition,
  ServicePublishDeclaration,
  WorkspacePreparedConfirmation,
} from "@brains/plugins";

// Publishing. A service that declares a publish provider has to describe
// one, and the pipeline hands it rendered content and media rather than an
// entity. Named consumer: @brains/social-media.
export type {
  PublishImageData,
  PublishMediaData,
  PublishProvider,
  PublishResult,
} from "@brains/contracts";

// Long-running work. A job that fetches and enriches reports progress against
// named milestones rather than invented percentages, and returns a failure in
// the shape the queue records. Named consumer: @brains/link.
export { JobResult, PROGRESS_STEPS } from "@brains/contracts";

// A provider reaches the outside world, so it reports what happened and it
// needs a way out. Both are handed to it by the runtime.
export type { LoggerContract } from "@brains/utils/logger";

// What a package tells brain.yaml it reads from the environment. Consumers
// today: social-media, directory-sync, stock-photo, newsletter, analytics.
export type { EnvVarDecl } from "@brains/utils/env-schema";
export type { FetchLike } from "@brains/utils/fetch-like";

export { z } from "@brains/utils/zod";
