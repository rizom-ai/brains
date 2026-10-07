import { defineMessageInterfacePackage } from "@brains/sdk/interfaces";
import { chatConfigSchema } from "./config";
import { platformInterface } from "./platform-interface";
import type { ChatPlatformDependencies } from "./platform-state";
import { CHAT_PLATFORMS } from "./types";

/**
 * Chat over Discord and Slack, as one package declaring two interfaces.
 *
 * Each platform the config holds credentials for is its own message
 * interface, with its own channel type, permission namespace, conversation
 * keys, Chat SDK app and listener. The package is what an operator installs
 * and configures; the interfaces are what the brain runs.
 */
export function chatInterfaces(
  dependencies: ChatPlatformDependencies = {},
): ReturnType<typeof defineMessageInterfacePackage<typeof chatConfigSchema>> {
  return defineMessageInterfacePackage({
    id: "chat",
    config: chatConfigSchema,
    interfaces: ({ config }) =>
      CHAT_PLATFORMS.filter((platform) => config.adapters[platform]).map(
        (platform) => platformInterface(platform, dependencies),
      ),
  });
}

/** The package as a deployment installs it: no injected dependencies. */
const chatPackage: ReturnType<typeof chatInterfaces> = chatInterfaces();

export default chatPackage;

export { chatConfigSchema } from "./config";
export { chatConfigFromEnv } from "./config-from-env";
export type { DiscordChatAdapterDefaults } from "./config-from-env";
export type {
  ChatConfig,
  ChatConfigInput,
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";
export type { ChatPlatformDependencies } from "./platform-state";
export {
  createDiscordChatUploadStoreScope,
  createSlackChatUploadStoreScope,
  discordChatUploadRefKind,
  slackChatUploadRefKind,
} from "./upload-store";
export { CHAT_PLATFORMS } from "./types";
export type {
  ChatAdapterMap,
  ChatPlatform,
  ChatWebhookMap,
  DiscordChatAdapter,
  GatewayListenerOptions,
  SlackChatAdapter,
} from "./types";
