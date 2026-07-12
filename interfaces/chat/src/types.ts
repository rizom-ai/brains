import type { Adapter, Thread } from "chat";

/**
 * A thread with opaque per-thread state. This package never reads or
 * writes Chat SDK thread state, and `ActionEvent.thread` arrives as
 * `Thread<unknown>` (the SDK fills the state slot with its raw-message
 * generic), so opaque state is the honest signature — it accepts threads
 * from both message and action handlers without casts.
 */
export type ChatThread = Thread<unknown>;

export type ChatPlatform = "discord" | "slack";

export const CHAT_PLATFORMS: readonly ChatPlatform[] = ["discord", "slack"];

export interface GatewayListenerOptions {
  waitUntil: (task: Promise<unknown>) => void;
}

export interface DiscordChatAdapter {
  startGatewayListener(
    options: GatewayListenerOptions,
    durationMs?: number,
    abortSignal?: AbortSignal,
    webhookUrl?: string,
  ): Promise<Response>;
}

export type SlackChatAdapter = Adapter;

export interface ChatAdapterMap {
  discord?: DiscordChatAdapter;
  slack?: SlackChatAdapter;
}

export interface ChatWebhookMap {
  discord?: (request: Request) => Promise<Response>;
  slack?: (request: Request) => Promise<Response>;
}
