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
  /** Long-lived adapters are handed to their daemon-owned listener loops. */
  gatewayLoop: { setAdapter(adapter: DiscordChatAdapter): void };
  slackSocketLoop: { setAdapter(adapter: SlackChatAdapter): void };
  runtimeState: IRuntimeStateNamespace;
}

function requireConfigValue(
  value: string | undefined,
  message: string,
): string {
  if (!value) throw new Error(message);
  return value;
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
    ? createSlackAdapter(
        slack.mode === "socket"
          ? {
              botToken: slack.botToken,
              mode: "socket",
              appToken: requireConfigValue(
                slack.appToken,
                "Slack app token is required in socket mode",
              ),
            }
          : {
              botToken: slack.botToken,
              signingSecret: requireConfigValue(
                slack.signingSecret,
                "Slack signing secret is required in webhook mode",
              ),
            },
      )
    : undefined;
  // Chat SDK 4.33's SlackAdapter declares botUserId optional while its Adapter
  // contract declares it required. Runtime initialization resolves the value.
  const compatibleSlackAdapter = slackAdapter as SlackChatAdapter | undefined;
  if (compatibleSlackAdapter && slack?.mode === "socket") {
    options.slackSocketLoop.setAdapter(compatibleSlackAdapter);
  }

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
