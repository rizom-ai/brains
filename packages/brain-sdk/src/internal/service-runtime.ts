/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer, reached with
 * `serviceRuntime(context)` on a slot context the brain built, tools that
 * keep snake-case names, the system and entity channels such a service
 * hears, and what its class declared beside the definition, as written
 * (`withTools`, `withJobHandlers`, `withStaticSiteOutput`,
 * `withApiRoutes`). No public
 * entry exports this module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

export {
  firstPartyTool,
  serviceRuntime,
  type ClaimedSystemType,
  type ServiceCorpusReads,
  type ServiceDashboardWidget,
  type ServiceInteraction,
  type ServiceAI,
  type ServiceClassJobs,
  type ServiceClassMessaging,
  type ServicePermissions,
  type ServiceAttachments,
  type ServiceTemplateOptions,
  type ServiceViews,
  type ServiceStudio,
  type ServiceToolCall,
  type ServiceDataSourceDeclaration,
  type ServiceDataSourceOptions,
  type ServiceEntityReads,
  type ServiceEntityShapes,
  type ServiceEntityWrites,
  type ServiceIdentity,
  type ServiceListenHandler,
  type ServiceListenMode,
  type ServiceListenOptions,
  type ServiceRuntime,
} from "@brains/plugins";
export {
  firstPartyJobHandler,
  withJobHandlers,
  withOwnedDataSources,
  withStaticSiteOutput,
  withApiRoutes,
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
} from "@brains/plugins";
