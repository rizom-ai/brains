import type { Thread } from "chat";

/**
 * A thread with opaque per-thread state. This package never reads or
 * writes Chat SDK thread state, and `ActionEvent.thread` arrives as
 * `Thread<unknown>` (the SDK fills the state slot with its raw-message
 * generic), so opaque state is the honest signature — it accepts threads
 * from both message and action handlers without casts.
 */
export type ChatThread = Thread<unknown>;

export type ChatPlatform = "discord";

export const CHAT_PLATFORMS: readonly ChatPlatform[] = ["discord"];

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

export interface ChatAdapterMap {
  discord?: DiscordChatAdapter;
}

export interface ChatWebhookMap {
  discord?: (request: Request) => Promise<Response>;
}
