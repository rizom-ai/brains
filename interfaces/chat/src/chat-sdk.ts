import type { IRuntimeStateNamespace } from "@brains/plugins";
import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createChatSubscriptionStateAdapter } from "./subscription-state";
import type {
  ChatAdapterMap,
  DiscordChatAdapter,
  SlackChatAdapter,
} from "./types";
import type {
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";
import type { ChatSdkApp } from "./chat-sdk-app";

interface CreateChatSdkAppOptions {
  userName: string;
  discord: DiscordChatAdapterConfig | undefined;
  slack: SlackChatAdapterConfig | undefined;
  /** The Discord adapter, once built, is handed to the gateway loop to poll. */
  gatewayLoop: { setAdapter(adapter: DiscordChatAdapter): void };
  runtimeState: IRuntimeStateNamespace;
}

/** Build one Chat SDK app for all configured chat adapters. */
export function createChatSdkApp(options: CreateChatSdkAppOptions): ChatSdkApp {
  const { discord, slack } = options;
  const discordAdapter = discord
    ? createDiscordAdapter({
        botToken: discord.botToken,
        publicKey: discord.publicKey,
        applicationId: discord.applicationId,
        mentionRoleIds: discord.mentionRoleIds,
      })
    : undefined;
  if (discordAdapter) options.gatewayLoop.setAdapter(discordAdapter);

  const slackAdapter = slack
    ? createSlackAdapter({
        botToken: slack.botToken,
        signingSecret: slack.signingSecret,
      })
    : undefined;
  // Chat SDK 4.33's SlackAdapter declares botUserId optional while its Adapter
  // contract declares it required. Runtime initialization resolves the value.
  const compatibleSlackAdapter = slackAdapter as SlackChatAdapter | undefined;

  const adapters = {
    ...(discordAdapter ? { discord: discordAdapter } : {}),
    ...(compatibleSlackAdapter ? { slack: compatibleSlackAdapter } : {}),
  } satisfies ChatAdapterMap;
  const enabledPlatforms = [
    ...(discord ? (["discord"] as const) : []),
    ...(slack ? (["slack"] as const) : []),
  ];
  const state =
    enabledPlatforms.length > 0
      ? createChatSubscriptionStateAdapter(
          options.runtimeState,
          enabledPlatforms,
        )
      : createMemoryState();

  return new Chat({
    userName: options.userName,
    adapters,
    ...(discord || slack
      ? {
          concurrency: {
            strategy: "queue" as const,
            maxQueueSize: 5,
            onQueueFull: "drop-oldest" as const,
          },
        }
      : {}),
    state,
  });
}
