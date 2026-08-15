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
