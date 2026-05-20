import type { Adapter } from "chat";

export const CHAT_PLATFORMS = ["discord", "matrix", "slack"] as const;

export type ChatPlatform = (typeof CHAT_PLATFORMS)[number];

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
  matrix?: Adapter;
  slack?: Adapter;
}

export interface ChatWebhookMap {
  discord?: (request: Request) => Promise<Response>;
}
