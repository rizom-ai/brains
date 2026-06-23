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
