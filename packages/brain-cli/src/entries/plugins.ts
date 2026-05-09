/** Curated public plugin contract surface. */

export {
  EntityPlugin,
  InterfacePlugin,
  MessageInterfacePlugin,
  ServicePlugin,
  createResource,
  createTool,
  defineChannel,
  toolError,
  toolSuccess,
  urlCaptureConfigSchema,
} from "@brains/plugins/public/plugin-api";
export type {
  BaseJobTrackingInfo,
  BasePluginContext,
  Channel,
  EntityPluginContext,
  IConversationsNamespace,
  IEntityService,
  IEntitiesNamespace,
  IEvalNamespace,
  IIdentityNamespace,
  IInsightsNamespace,
  IMessagingNamespace,
  IPromptsNamespace,
  IServiceTemplatesNamespace,
  IViewsNamespace,
  InterfacePluginContext,
  JobProgressEvent,
  JobProgressContext,
  JobProgressStatus,
  MessageJobTrackingInfo,
  Plugin,
  PluginConfig,
  PluginConfigInput,
  PluginFactory,
  Prompt,
  Resource,
  ResourceTemplate,
  ServicePluginContext,
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
