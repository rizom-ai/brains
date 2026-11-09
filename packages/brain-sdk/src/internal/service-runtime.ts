/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer, reached with
 * `serviceRuntime(context)` on a slot context the brain built, tools that
 * keep snake-case names, and the system and entity channels such a service hears. No
 * public entry exports this module.
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
  type ServiceStudio,
  type ServiceToolCall,
  type ServiceDataSourceDeclaration,
  type ServiceEntityReads,
  type ServiceEntityShapes,
  type ServiceIdentity,
  type ServiceListenHandler,
  type ServiceListenMode,
  type ServiceListenOptions,
  type ServiceRuntime,
} from "@brains/plugins";
export { withOwnedDataSources } from "@brains/plugins";
export { internalFullScope } from "@brains/plugins";
export type { AuthBackend, ContentVisibility } from "@brains/plugins";
export {
  SYSTEM_CHANNELS,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
  initialSyncCompletedChannel,
} from "@brains/plugins";
