/** Advanced public contracts shared by declarative authoring families. */

export type {
  Channel,
  ChannelDeliveryInput,
  ChannelDeliveryProvider,
  ChannelDeliveryResult,
  ChannelDeliveryThreading,
  ChannelDescriptor,
  ChannelSubjectPattern,
  JobProgressEvent,
  PluginPackageDefinition,
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
  ToolConfirmation,
  ToolContext,
  ToolResponse,
  ToolVisibility,
} from "@brains/plugins/public/plugin-api";

export {
  AgentResponseSchema,
  ChatContextSchema,
  PendingConfirmationSchema,
  ToolResultDataSchema,
} from "@brains/plugins/contracts/agent";
export type {
  AgentNamespace,
  AgentResponse,
  ChatContext,
  PendingConfirmation,
  ToolResultData,
} from "@brains/plugins/contracts/agent";

export { AppInfoSchema } from "@brains/plugins/contracts/app-info";
export type { AppInfo } from "@brains/plugins/contracts/app-info";
export {
  RuntimeHealthCheckSchema,
  RuntimeQueueSignalsSchema,
  RuntimeReadinessSchema,
  RuntimeResourceSignalsSchema,
} from "@brains/plugins";
export type {
  RuntimeHealthCheck,
  RuntimeProjectionCircuitSignal,
  RuntimeProjectionSignals,
  RuntimeQueueSignals,
  RuntimeReadiness,
  RuntimeResourceSignals,
  RuntimeWorkerSignals,
} from "@brains/plugins";

export {
  ConversationSchema,
  MessageSchema,
} from "@brains/plugins/contracts/conversations";
export type {
  Conversation,
  Message,
  MessageRole,
} from "@brains/plugins/contracts/conversations";

export {
  AnchorProfileSchema,
  BrainCharacterSchema,
} from "@brains/plugins/contracts/identity";
export type {
  AnchorProfile,
  BrainCharacter,
} from "@brains/plugins/contracts/identity";

export { ExtensionMetadataSchema } from "@brains/plugins/contracts/metadata";
export type { ExtensionMetadata } from "@brains/plugins/contracts/metadata";

export {
  BaseMessageSchema,
  MessageResponseSchema,
} from "@brains/plugins/contracts/messaging";
export type {
  BaseMessage,
  MessageContext,
  MessageResponse,
  MessageSendOptions,
  MessageSender,
  MessageWithPayload,
} from "@brains/plugins/contracts/messaging";

/**
 * What a host and an infrastructure package name, which ordinary authoring
 * does not.
 *
 * A console keeps a registry of what other packages announced, and a sync
 * package holds a mirror of the entity service; both need the runtime's own
 * shapes. Neither is something an extension declares, so they are advanced
 * contracts here rather than ordinary ones on the services entry — the
 * surface test treats the registration and entity-service shapes as private
 * to the normal path. Named consumers: @brains/studio, @brains/dashboard,
 * @brains/directory-sync.
 */
export type {
  DashboardWidgetRegistration,
  EntityMirror,
  EntityMirrorClient,
  StudioOverviewContributionRegistration,
  StudioWorkspaceRegistration,
  StudioWorkspaceRegistrationResult,
} from "@brains/plugins";

/**
 * Implementing a data source by hand, rather than declaring one.
 *
 * `defineDataSource` is how a package declares one, and it is what ordinary
 * authoring uses. A package that implements the interface directly needs the
 * context that comes with it, and that context carries a scoped entity
 * service — so these live here, on the advanced entry, rather than putting
 * the entity service in the declarations of the entity authoring surface.
 * Named consumer: @brains/unified-inbox.
 */
export type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
