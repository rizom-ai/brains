import type { RuntimeUploadScopeOptions } from "@brains/plugins";

export const discordChatUploadRefKind = "discord-chat-upload";

export function createDiscordChatUploadStoreScope(): RuntimeUploadScopeOptions {
  return {
    namespace: "discord-chat",
    refKind: discordChatUploadRefKind,
    routePath: "/api/webhooks/chat/discord/uploads",
  };
}
