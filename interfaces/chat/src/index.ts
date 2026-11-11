import { createChatInterface } from "./chat-interface";

export {
  createChatInterface,
  type ChatInterfaceDefinition,
  type ChatInterfaceDeps,
} from "./chat-interface";
export { chatConfigSchema } from "./config";
export { chatConfigFromEnv } from "./config-from-env";
export type { DiscordChatAdapterDefaults } from "./config-from-env";
export type {
  ChatConfig,
  ChatConfigInput,
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";
export { ThreadRegistry } from "./thread-registry";
export { CHAT_PLATFORMS } from "./types";
export type {
  ChatAdapterMap,
  ChatPlatform,
  ChatWebhookMap,
  DiscordChatAdapter,
  GatewayListenerOptions,
  SlackChatAdapter,
} from "./types";

/** The chat interface, with the real fetch and the brain's auth backend. */
const chatInterface: ReturnType<typeof createChatInterface> =
  createChatInterface();

export default chatInterface;
