import type { ClassRuntimeState } from "@brains/sdk/internal/interface-runtime";
import { Chat, type Adapter } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMatrixAdapter } from "@beeper/chat-adapter-matrix";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createChatSubscriptionStateAdapter } from "./subscription-state";
import type {
  ChatAdapterMap,
  DiscordChatAdapter,
  SlackChatAdapter,
} from "./types";
import type {
  DiscordChatAdapterConfig,
  MatrixChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";
import type { ChatSdkApp } from "./chat-sdk-app";

interface CreateChatSdkAppOptions {
  userName: string;
  discord: DiscordChatAdapterConfig | undefined;
  slack: SlackChatAdapterConfig | undefined;
  matrix: MatrixChatAdapterConfig | undefined;
  /** Long-lived adapters are handed to their daemon-owned listener loops. */
  gatewayLoop: { setAdapter(adapter: DiscordChatAdapter): void };
  slackSocketLoop: { setAdapter(adapter: SlackChatAdapter): void };
  runtimeState: ClassRuntimeState;
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
  const { discord, slack, matrix } = options;
  const discordAdapter = discord
    ? createDiscordAdapter({
        botToken: discord.botToken,
        publicKey: discord.publicKey,
        applicationId: discord.applicationId,
        mentionRoleIds: discord.mentionRoleIds,
      })
    : undefined;
  if (discordAdapter) options.gatewayLoop.setAdapter(discordAdapter);
  // Under exactOptionalPropertyTypes, the Chat SDK adapters' botUserId
  // (string | undefined) does not satisfy Adapter's optional botUserId (absent
  // or string). The runtime contract is the same.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above: no honest type describes the vendored adapter under this compiler option
  const compatibleDiscordAdapter = discordAdapter as
    (DiscordChatAdapter & Adapter) | undefined;

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
  // Under exactOptionalPropertyTypes, the Chat SDK adapters' botUserId
  // (string | undefined) does not satisfy Adapter's optional botUserId (absent
  // or string). The runtime contract is the same.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above: no honest type describes the vendored adapter under this compiler option
  const compatibleSlackAdapter = slackAdapter as SlackChatAdapter | undefined;
  if (compatibleSlackAdapter && slack?.mode === "socket") {
    options.slackSocketLoop.setAdapter(compatibleSlackAdapter);
  }

  // The Matrix adapter syncs from initialize() onward, reconnecting on its
  // own, so it needs no listener loop. It logs in with the bot's password
  // once and keeps the session in the chat state, which persists its keys.
  const createdMatrixAdapter = matrix
    ? createMatrixAdapter({
        baseURL: matrix.baseUrl,
        auth: {
          type: "password",
          username: matrix.userId.slice(1).split(":")[0] ?? "",
          password: matrix.password,
          userID: matrix.userId,
        },
        userName: options.userName,
        // Joining on invite is how a person opens a DM with the bot. In a
        // room the bot still answers only mentions, in allowed channels.
        ...(matrix.allowDMs ? { inviteAutoJoin: {} } : {}),
        // matrix-js-sdk logs every request at debug; the brain log keeps warnings.
        matrixSDKLogLevel: "warn",
      })
    : undefined;
  // Under exactOptionalPropertyTypes, the Chat SDK adapters' botUserId
  // (string | undefined) does not satisfy Adapter's optional botUserId (absent
  // or string). The runtime contract is the same.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above: no honest type describes the vendored adapter under this compiler option
  const matrixAdapter = createdMatrixAdapter as Adapter | undefined;

  const adapters = {
    ...(compatibleDiscordAdapter ? { discord: compatibleDiscordAdapter } : {}),
    ...(compatibleSlackAdapter ? { slack: compatibleSlackAdapter } : {}),
    ...(matrixAdapter ? { matrix: matrixAdapter } : {}),
  } satisfies ChatAdapterMap;
  const enabledPlatforms = [
    ...(discord ? (["discord"] as const) : []),
    ...(slack ? (["slack"] as const) : []),
    ...(matrix ? (["matrix"] as const) : []),
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
    ...(enabledPlatforms.length > 0
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
