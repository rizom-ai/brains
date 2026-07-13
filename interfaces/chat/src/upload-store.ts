import type { RuntimeUploadScopeOptions } from "@brains/plugins";

export const discordChatUploadRefKind = "discord-chat-upload";
export const slackChatUploadRefKind = "slack-chat-upload";

export function createDiscordChatUploadStoreScope(): RuntimeUploadScopeOptions {
  return {
    namespace: "discord-chat",
    refKind: discordChatUploadRefKind,
    routePath: "/api/webhooks/chat/discord/uploads",
  };
}

export function createSlackChatUploadStoreScope(): RuntimeUploadScopeOptions {
  return {
    namespace: "slack-chat",
    refKind: slackChatUploadRefKind,
    routePath: "/api/webhooks/chat/slack/uploads",
  };
}
