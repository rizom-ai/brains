/** Declarative service authoring contract. */

export {
  defineAccountSettings,
  defineStudioWorkspace,
  defineDashboardWidget,
  defineEntityCatalog,
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineSubscription,
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
  AnyWorkspaceActionDefinition,
  WorkspaceActionDefinition,
  ServicePublishDeclaration,
  WorkspacePreparedConfirmation,
} from "@brains/plugins";

// The shell's own lifecycle signals, for a package whose work waits on one.
// Seeding an identity derived from imported content cannot run before the
// import has landed, and the name of that moment is the runtime's to give.
// Named consumer: @brains/profile.
export { SYSTEM_CHANNELS } from "@brains/plugins";
export type { SystemChannelName } from "@brains/plugins";

// Profile kinds. A package declaring what shapes of profile this brain can
// represent describes each as data, and reads the finalized selection back
// where it shapes behaviour. Named consumer: @brains/profile.
export type {
  ProfileCategory,
  ProfileKindDefinition,
  ProfileKindLabels,
  ResolvedProfileKind,
  ResolvedProfileSelection,
} from "@brains/plugins";

// The brain's own identity records, for a package that seeds or migrates
// them. The body schemas are the runtime's, so what a package writes and
// what the brain accepts are the same document. Named consumer:
// @brains/profile.
export {
  anchorProfileBodySchema,
  anchorProfileKindSchema,
  brainCharacterBodySchema,
} from "@brains/plugins";
export type { AnchorProfile, BrainCharacter } from "@brains/plugins";

// Extending an entity type this package stewards, and validating what is
// persisted to it. Named consumer: @brains/profile.
export type { ServiceEntityExtension } from "@brains/plugins";

// Insights. A service that contributes an insight authors the handler the
// `insights` slot returns; the context hands it scoped reads and the
// caller's visibility. Type-only. Named consumer: @brains/analytics.
export type {
  EntityInsightContext,
  EntityInsightDeclaration,
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

// Administering this brain's users: the People, Invitations, Audit and
// Administration workspaces run over this surface. Type-only — the instance
// still arrives through the runtime, and a package holding the type cannot
// conjure the service. It is the measured set of operations administration
// actually performs, and AuthService implements it nominally so the class and
// this contract cannot drift apart silently. Named consumer: @brains/admin.
export type {
  AuthAdministration,
  AuthAdminUserSummary,
  AuthAuditEvent,
  AppendAuthAuditEventInput,
} from "@brains/auth-service";

// Where the running auth implementation is published. A console surface
// resolves the caller behind its own routes and records what an operator
// did; asking the runtime is what replaces reaching for a module-level
// global in auth-service. Named consumers: @brains/dashboard,
// @brains/studio, @brains/web-chat, @brains/mcp.
export type { IAuthRegistry } from "@brains/plugins";

// Who a request is from, and the audit trail. A service plugin that serves
// HTTP resolves the caller before acting (dashboard, studio) and records
// what an operator did (studio); neither needs anything else auth knows.
// Type-only, like the administration contract above.
// Named consumers: @brains/dashboard, @brains/studio.
export type {
  AuthAudit,
  AuthCaller,
  AuthPrincipal,
} from "@brains/auth-service";

export { z } from "@brains/utils/zod";
