import type { IRuntimeStateNamespace } from "@brains/plugins";
import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createDiscordSubscriptionStateAdapter } from "./subscription-state";
import type { ChatAdapterMap, DiscordChatAdapter } from "./types";
import type { DiscordChatAdapterConfig } from "./config";
import type { ChatSdkApp } from "./discord-chat-app";

interface CreateDiscordChatSdkAppOptions {
  userName: string;
  discord: DiscordChatAdapterConfig | undefined;
  /** The Discord adapter, once built, is handed to the gateway loop to poll. */
  gatewayLoop: { setAdapter(adapter: DiscordChatAdapter): void };
  runtimeState: IRuntimeStateNamespace;
}

/**
 * Thin glue over the Chat SDK: build the app, and when Discord is configured,
 * wire its adapter onto the gateway loop and make thread subscriptions durable.
 * Behaviour is covered by the chat-interface integration tests; DiscordChatApp
 * owns the routes/lifecycle around whatever this returns.
 */
export function createDiscordChatSdkApp(
  options: CreateDiscordChatSdkAppOptions,
): ChatSdkApp {
  const { discord } = options;
  if (!discord) {
    return new Chat({
      userName: options.userName,
      adapters: {},
      state: createMemoryState(),
    });
  }

  const discordAdapter = createDiscordAdapter({
    botToken: discord.botToken,
    publicKey: discord.publicKey,
    applicationId: discord.applicationId,
    mentionRoleIds: discord.mentionRoleIds,
  });
  options.gatewayLoop.setAdapter(discordAdapter);

  return new Chat({
    userName: options.userName,
    adapters: { discord: discordAdapter } satisfies ChatAdapterMap,
    concurrency: {
      strategy: "queue",
      maxQueueSize: 5,
      onQueueFull: "drop-oldest",
    },
    state: createDiscordSubscriptionStateAdapter(options.runtimeState),
  });
}
