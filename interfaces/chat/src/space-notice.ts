import {
  spaceNoticeContentSchema,
  type SpaceNoticeAction,
  type SpaceNoticeContent,
  type SpaceNoticeRequest,
  type SpaceNoticeResult,
} from "@brains/contracts";
import type { FetchLike } from "@brains/utils/fetch-like";
import type { ActionEvent, CardElement } from "chat";
import { SPACE_NOTICE_ACTION } from "./chat-cards";
import { getChatConversationId } from "./chat-metadata";
import type { ChatSdkApp } from "./chat-sdk-app";
import { addDiscordReaction } from "./discord-message-components";
import { getSpaceThreadId } from "./discord-routing";

export interface SpaceNoticeDeps {
  app: Pick<ChatSdkApp, "channel"> | undefined;
  /** For reactions; a brain without Discord posts without them. */
  discordBotToken: string | undefined;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
  fetchFn?: FetchLike | undefined;
}

/** The notice as a card: its lines, then one button per action. */
export function spaceNoticeCard(request: SpaceNoticeContent): CardElement {
  return {
    type: "card",
    title: request.title,
    children: [
      ...request.lines.map((content) => ({ type: "text" as const, content })),
      ...(request.actions.length > 0
        ? [
            {
              type: "actions" as const,
              children: request.actions.map((action) => ({
                type: "button" as const,
                id: SPACE_NOTICE_ACTION,
                label: action.label,
                value: action.value,
              })),
            },
          ]
        : []),
    ],
  };
}

/** Post a space notice and react to the messages it is about. */
export async function postSpaceNotice(
  deps: SpaceNoticeDeps,
  request: SpaceNoticeRequest,
): Promise<SpaceNoticeResult> {
  if (!deps.app) throw new Error("The chat app is not built");
  const sent = await deps.app
    .channel(request.channelId)
    .post({ card: spaceNoticeCard(request) });
  const botToken = deps.discordBotToken;
  if (request.interfaceType === "discord" && botToken) {
    await Promise.all(
      request.reactions.map((reaction) =>
        addDiscordReaction({
          threadId: request.channelId,
          messageId: reaction.messageId,
          emoji: reaction.emoji,
          botToken,
          logger: deps.logger,
          ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
        }),
      ),
    );
  }
  return { messageId: sent.id };
}

/** Ask the plugin that posted a notice about a click; its answer, if any. */
export type AskNoticePoster = (action: SpaceNoticeAction) => Promise<unknown>;

/**
 * A click on a space notice's button. The notice's poster decides what it
 * means and answers with the notice's new content, which replaces the notice;
 * without an answer the notice stays as it is.
 */
export async function handleSpaceNoticeAction(
  ask: AskNoticePoster,
  event: Pick<
    ActionEvent,
    "adapter" | "thread" | "threadId" | "messageId" | "value" | "user"
  >,
): Promise<void> {
  if (!event.thread || !event.value) return;
  const answer = await ask({
    conversationId: getChatConversationId(
      event.adapter.name,
      getSpaceThreadId(event.thread),
    ),
    noticeMessageId: event.messageId,
    value: event.value,
    by: event.user.fullName || event.user.userName,
  });
  const content = spaceNoticeContentSchema.safeParse(answer);
  if (!content.success) return;
  await event.adapter.editMessage(event.threadId, event.messageId, {
    card: spaceNoticeCard(content.data),
  });
}
