import type { IRuntimeStateStore } from "@brains/sdk/interfaces";
import { Chat } from "chat";
import type {
  ActionEvent,
  Channel,
  Message,
  MessageContext,
  Thread,
} from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import {
  createChatSubscriptionStateAdapter,
  type ChatRuntimeState,
} from "./subscription-state";
import type {
  ChatAdapterMap,
  ChatWebhookMap,
  DiscordChatAdapter,
  SlackChatAdapter,
} from "./types";
import type {
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";

/**
 * The slice of the Chat SDK app the interface drives: handler registration,
 * the webhooks it exposes, and initialize/shutdown.
 */
export interface ChatSdkApp {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  webhooks?: ChatWebhookMap;
  onDirectMessage(
    handler: (
      thread: Thread,
      message: Message,
      channel: Channel,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onNewMention(
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onNewMessage(
    pattern: RegExp,
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onSubscribedMessage(
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onAction(handler: (event: ActionEvent) => Promise<void>): void;
  onAction(
    actionIds: string[] | string,
    handler: (event: ActionEvent) => Promise<void>,
  ): void;
}

interface CreateChatSdkAppOptions {
  userName: string;
  /** Exactly one of these: an app serves one platform's interface. */
  discord?: DiscordChatAdapterConfig | undefined;
  slack?: SlackChatAdapterConfig | undefined;
  /** Long-lived adapters are handed to their daemon-owned listener loops. */
  gatewayLoop?: { setAdapter(adapter: DiscordChatAdapter): void } | undefined;
  slackSocketLoop?: { setAdapter(adapter: SlackChatAdapter): void } | undefined;
  runtimeState: ChatRuntimeState;
}

function requireConfigValue(
  value: string | undefined,
  message: string,
): string {
  if (!value) throw new Error(message);
  return value;
}

/** Build the Chat SDK app for one platform's adapter. */
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
  if (discordAdapter) options.gatewayLoop?.setAdapter(discordAdapter);

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
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above: the vendored SDK contradicts itself between SlackAdapter and Adapter, so no honest type describes what it returns
  const compatibleSlackAdapter = slackAdapter as SlackChatAdapter | undefined;
  if (compatibleSlackAdapter && slack?.mode === "socket") {
    options.slackSocketLoop?.setAdapter(compatibleSlackAdapter);
  }

  const adapters = {
    ...(discordAdapter ? { discord: discordAdapter } : {}),
    ...(compatibleSlackAdapter ? { slack: compatibleSlackAdapter } : {}),
  } satisfies ChatAdapterMap;
  const platform = discord ? "discord" : slack ? "slack" : undefined;
  const state = platform
    ? createChatSubscriptionStateAdapter(options.runtimeState, platform)
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

export type { IRuntimeStateStore };
