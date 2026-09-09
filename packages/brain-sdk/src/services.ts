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
  // A package that *is* infrastructure — it runs a checkout, talks to the
  // git broker, mirrors every type to files — names this token and its setup
  // is given those facts. Ordinary authoring never writes it, and never sees
  // them. Named consumer: @brains/directory-sync.
  infrastructure,
  jsonResponse,
  jsonError,
  // A route whose answer is the response itself. A service taking a form
  // submission redirects the browser, and a redirect does not survive a JSON
  // envelope. Named consumer: @brains/newsletter.
  verbatim,
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
  OperatorRegionBlock,
  OperatorCardBlock,
  OperatorColumnsBlock,
  OperatorPanelBlock,
  OperatorViewStatus,
  // What a workspace action's form and result declare. An author who builds
  // a form field map or a result declaration outside the action call needs
  // these names; the action helper takes them either way.
  WorkspaceActionFormControl,
  WorkspaceActionFormDefinition,
  WorkspaceActionFormFieldDefinition,
  WorkspaceActionFormFieldMap,
  WorkspaceActionFormOption,
  WorkspaceActionResultDefinition,
  WorkspaceActionResultFieldDefinition,
  WorkspaceActionResultFieldMap,
  BoundWorkspaceAction,
  OperatorBindingContext,
  OperatorViewBlock,
  EntityEvalContext,
  ServiceEvalHandler,
  ServiceJobDefinition,
  ServiceJobReference,
  ServiceJobStatus,
  ServicePackageDefinition,
  ServiceToolDefinition,
  // What the `tools` and `checks` slots return, and what an interaction is.
  // A package that builds one of these in a helper needs the type to
  // annotate that helper's return. Named consumer: @brains/unified-inbox.
  AnyServiceToolDefinition,
  ServiceCheckDeclaration,
  ServiceInteractionDeclaration,
  // What a service reads of the corpus and asks of the model, for a package
  // whose engine composes both. Named consumer: @brains/playbooks.
  ServiceCorpusHit,
  ServiceCorpusSearch,
  ServiceJudge,
  // A tool's caller and its answer, for handlers built outside the
  // declaration. Named consumer: @brains/playbooks.
  ToolContext,
  ToolResponse,
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
// What a caller at a given permission level may see, for an operator surface
// that reads other packages' entities on their behalf.
// Named consumer: @brains/content-pipeline.
export { permissionToVisibilityScope } from "@brains/plugins";

// Hosting declared widgets and operator views. The dashboard is where a
// `dashboardWidgets` declaration ends up: it validates what the runtime sent,
// decides who may see each widget, and renders the blocks the declaration
// returned. Every shape here is one the runtime already defines for those
// declarations. Named consumer: @brains/dashboard.
export {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  PermissionService,
  UserPermissionLevelSchema,
  defineDataSource,
  safeParseRuntimeDashboardWidgetData,
} from "@brains/plugins";
export type { AnyDataSourceDeclaration } from "@brains/plugins";
export type {
  ConsoleSurface,
  DashboardDigestLine,
  DashboardWidgetProviderContext,
  EntityCount,
  InteractionInfo,
  RuntimeDashboardOperatorPanelBlock,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  RuntimeOperatorLinkTarget,
  RuntimeStudioWorkspaceData,
  SurfacePermissionLevel,
} from "@brains/plugins";

// What the brain reports about itself, for the console that shows it.
export type { AppInfo } from "@brains/plugins/contracts/app-info";

// Why a request over the bus failed, as a word rather than a sentence. A
// package that answers differently when a capability is absent checks this;
// the message beside it may be reworded at any time.
// Named consumer: @brains/studio, whose assist path reports 503 rather than
// 400 when nothing is listening.
export { SdkError, sdkErrorCodeSchema, sdkErrorSchema } from "@brains/plugins";
export type { SdkErrorCode, SdkErrorData } from "@brains/plugins";

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

// Bookkeeping that is not an entity, for a service whose setup hands a
// long-running consumer the store it checkpoints into. The setup context
// gives out scoped stores; these name what one holds and how it is asked
// for. Named consumer: @brains/atproto, whose Jetstream cursor lives here.
export type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/plugins";

// What the brain offers publicly, as the setup context lists it, for a
// service that puts those skills on a card. Named consumer: @brains/atproto.
export type { PublicSkill } from "@brains/plugins";

// What a package delegated by declaring `publish`, the permission check a
// service applies on a caller's behalf, the media another package resolves
// from an entity, and the work this package queued. A service that publishes
// what other packages declared holds all four.
// Named consumer: @brains/content-pipeline.
export type {
  IAttachmentsNamespace,
  IPermissionsNamespace,
  ServiceActiveJob,
  ServiceRecentJob,
  ServiceJobs,
  ServiceLifecycle,
  ServiceJobHooks,
  ServiceJobSettledContext,
  ServiceJobSettledHandler,
  ServiceBatchOperation,
  ServiceBatchOptions,
  ServiceBatchReference,
  ServiceBatchStatus,
  InfrastructureAccess,
  ServiceGitBroker,
  ServiceInfrastructureContext,
  ServiceRole,
  IRuntimeStateNamespace,
  RuntimeHealthCheck,
  OperationalHealthProvider,
  ServicePublisher,
  ServicePublishingAccess,
} from "@brains/plugins";

// The directories a package's build writes into, which is what the
// `staticSite` slot returns. The runtime serves them; naming them is the
// declaring package's business. Named consumer: @brains/site-builder.
// What a package writes down and renders, for one whose sections come from
// the brain it is composed into rather than from its own source.
// Named consumer: @brains/site-content.
export type {
  ServiceSchema,
  ServiceRenderSchema,
  ServiceTemplateDefinition,
  ServiceTemplateReads,
} from "@brains/plugins";

export type { StaticSiteOutput } from "@brains/plugins";

// What a console holds from registration: editing every type on the
// operator's behalf, the shapes those types take, who is calling, and the
// reads a console makes about the brain it runs in.
// Named consumer: @brains/studio.
export type {
  EntityAction,
  IInboxNamespace,
  IInboxFollowUpsNamespace,
  IPluginsNamespace,
  InterfaceCaller,
  OperatorEntityWrites,
  OperatorUploadOutcome,
  OperatorUploadRequest,
  RuntimeReadiness,
  ServiceChannelReader,
  ServiceEntityShapes,
  UserPermissionLevel,
} from "@brains/plugins";

// One bounded status document in runtime state, read-modify-written one
// mutation at a time. A package that keeps a projection of its own work —
// what is running, what the last few runs did — needs exactly this engine,
// and writing it per package is how two of them drift apart.
// Named consumers: @brains/site-builder, @brains/directory-sync.
export { SerializedStatusStore } from "@brains/plugins";
export type { SerializedStatusStoreOptions } from "@brains/plugins";

// What the `routes` and `subscriptions` slots return, for a package that
// builds either in a helper and has to annotate its return.
// Named consumer: @brains/atproto.
export type {
  AnyInterfaceRouteDefinition,
  AnySubscriptionDefinition,
} from "@brains/plugins";
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

// Two request checks a console applies before a state-changing route runs:
// the request came from the console's own origin, and a JSON body did too.
// Pure functions of the request. Named consumer: @brains/studio.
export {
  requireSameOriginJson,
  requireSameOriginRequest,
} from "@brains/auth-service";

// What Studio hosts. Every package that declares `studioWorkspaces` or
// `dashboardWidgets` announces one over the bus, and the console is what
// those announcements reach: it validates what the runtime sent, decides who
// may see each, and renders what the declaration returned. The shapes are
// the runtime's; a host has to name them. Named consumer: @brains/studio.
export {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
} from "@brains/plugins";
export type {
  RuntimeDashboardOperatorView,
  RuntimeDashboardWidgetData,
  RuntimeStudioOperatorCardBlock,
  RuntimeStudioOperatorPanelBlock,
  RuntimeStudioOperatorView,
  StudioOverviewContributionUnregistration,
  StudioWorkspaceActor,
  StudioWorkspaceDescriptor,
  StudioWorkspaceUnregistration,
} from "@brains/plugins";

export { z } from "@brains/utils/zod";
