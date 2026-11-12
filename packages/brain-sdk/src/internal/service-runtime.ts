/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer, reached with
 * `serviceRuntime(context)` on a slot context the brain built, tools that
 * keep snake-case names, the system, entity and conversation channels such a
 * service hears, and the shapes of what its runtime reads and composes: the
 * runtime state its class stored, the shell's identity records and profile
 * kinds, the Inbox sources and their items, a list tool's output and a
 * Studio workspace it composes, and what its class declared beside the
 * definition, as written (`withTools`, `withJobHandlers`,
 * `withStaticSiteOutput`, `withApiRoutes`). No public entry exports this
 * module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

export {
  firstPartyTool,
  serviceRuntime,
  type ClaimedSystemType,
  type ClassRuntimeState,
  type ClassRuntimeStateStore,
  type ServiceCorpusReads,
  type ServiceDashboardWidget,
  type ServiceInteraction,
  type ServiceAI,
  type ServiceClassJobs,
  type ServiceClassMessaging,
  type ServicePermissions,
  type ServiceAttachments,
  type ServiceAtprotoProjections,
  type ServiceTemplateOptions,
  type ServiceViews,
  type ServiceStudio,
  type ServiceToolCall,
  type ServiceDataSourceDeclaration,
  type ServiceDataSourceOptions,
  type ServiceEntityReads,
  type ServiceEntityShapes,
  type ServiceEntityWrites,
  type ServiceGitBroker,
  type ServiceGroupings,
  type ServiceIdentity,
  type ServiceListenHandler,
  type ServiceListenMode,
  type ServiceListenOptions,
  type ServiceRuntime,
  classEntityServiceOf,
  type ServiceClassEntityService,
  type ServiceEntityMirror,
  type ServiceEntityMirrorClient,
} from "@brains/plugins";
export {
  firstPartyJobHandler,
  withJobHandlers,
  withOwnedDataSources,
  withStaticSiteOutput,
  withApiRoutes,
  withWebRoutes,
  withTools,
  type FirstPartyJobCall,
  type FirstPartyJobHandler,
} from "@brains/plugins";
export { internalFullScope } from "@brains/plugins";
export type { AuthBackend, ContentVisibility } from "@brains/plugins";
export {
  SYSTEM_CHANNELS,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
  initialSyncCompletedChannel,
  conversationMessageAddedChannel,
  type ConversationMessageAddedPayload,
  type EntityChangePayload,
} from "@brains/plugins";
export {
  anchorProfileBodySchema,
  brainCharacterBodySchema,
  type BrainCharacter,
  type ProfileCategory,
  type ProfileKindDefinition,
} from "@brains/plugins";
export {
  inboxContactSchema,
  inboxFacetsSchema,
  inboxIdSchema,
  inboxItemDetailSchema,
  inboxItemIdSchema,
  inboxItemSchema,
  inboxSourceDescriptorSchema,
  inboxSourceMetadataSchema,
  inboxUrgencySchema,
  resolvedInboxFollowUpSchema,
  type InboxFacets,
  type InboxSource,
  type InboxSourceMetadata,
} from "@brains/plugins";
export {
  createListToolOutputSchema,
  normalizeSameOriginPath,
  type ListToolOutputSchema,
} from "@brains/plugins";
export {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  type RuntimeOperatorActionControl,
  type RuntimeStudioOperatorBlock,
  type RuntimeStudioOperatorPanelBlock,
  type RuntimeStudioOperatorRegionBlock,
  type RuntimeStudioWorkspaceData,
  type StudioWorkspaceActor,
} from "@brains/plugins";
export {
  studioWorkspaceRegisterContract,
  studioWorkspaceRegistrationSchema,
  studioWorkspaceUnregisterContract,
  studioOverviewContributionRegisterContract,
  studioOverviewContributionSchema,
  studioOverviewContributionUnregisterContract,
  type StudioWorkspaceDescriptor,
  type StudioWorkspaceRegistration,
  type StudioOverviewContributionRegistration,
  type StudioOverviewContributionUnregistration,
} from "@brains/plugins";
export {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  dashboardDigestLineSchema,
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
  safeParseRuntimeDashboardWidgetData,
  type DashboardDigestLine,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRenderer,
  type RuntimeDashboardOperatorPanelBlock,
  type RuntimeDashboardOperatorView,
  type RuntimeDashboardWidgetData,
  type RuntimeOperatorLaunchIntent,
  type RuntimeOperatorLinkTarget,
  type RuntimeStudioOperatorCardBlock,
  type RuntimeStudioOperatorView,
  type RuntimeStudioOperatorViewFact,
  type RuntimeStudioOperatorViewStatus,
} from "@brains/plugins";
export {
  defineAnalyticsReport,
  type AnalyticsReportContext,
  type AnalyticsReportDefinition,
} from "@brains/plugins";
export {
  inboxActorSchema,
  inboxItemListSchema,
  type ChannelDeliveryProvider,
  type MessageResponse,
} from "@brains/plugins";
export type {
  AppInfo,
  EntityCount,
  InitialSyncOutcome,
  InteractionInfo,
  PluginsRegisteredAnswer,
  RuntimeHealthCheck,
} from "@brains/plugins";
export type {
  ApiRouteDefinition,
  BatchOperation,
  EnqueueJobRequest,
  JobInfo,
} from "@brains/plugins";
export {
  createTool,
  toolError,
  toolSuccess,
  type Tool,
  type ToolContext,
  type ToolResponse,
  type ToolResult,
} from "@brains/plugins";
export {
  PluginConfigValidationError,
  SerialQueue,
  SerializedStatusStore,
  createAdminListTool,
  hasPermission,
} from "@brains/plugins";
