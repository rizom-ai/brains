/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer, reached with
 * `serviceRuntime(context)` on a slot context the brain built, tools that
 * keep snake-case names, the system, entity and conversation channels such a
 * service hears, and the shapes of what its runtime reads and composes: the
 * runtime state its class stored, the shell's identity records and profile
 * kinds, the Inbox sources and their items, a list tool's output and a
 * Studio workspace it composes. No public entry exports this module.
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
