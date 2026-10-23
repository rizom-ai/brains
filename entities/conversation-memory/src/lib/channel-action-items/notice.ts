import {
  SPACE_NOTICE_VALUE_LIMIT,
  type SpaceNoticeContent,
  type SpaceNoticeRequest,
} from "@brains/contracts";
import type {
  Conversation,
  IConversationsNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import {
  updateBookmark,
  type ChannelBookmark,
  type ChannelNotice,
} from "./pickup";

const PIN = "📌";
const POSTING_TIMEOUT_MS = 2 * 60 * 1000;
const LABEL_LIMIT = 80;

export interface ChannelNoticeDeps {
  conversations: Pick<IConversationsNamespace, "get" | "list">;
  bookmarks: IRuntimeStateStore<ChannelBookmark>;
  /** Post a space notice; the posted message's id, or undefined when it failed. */
  post: (request: SpaceNoticeRequest) => Promise<string | undefined>;
  now?: () => Date;
}

function undoLabel(title: string): string {
  const label = `Undo: ${title}`;
  return label.length <= LABEL_LIMIT
    ? label
    : `${label.slice(0, LABEL_LIMIT - 1)}…`;
}

type NoticeCard = ChannelNotice["cards"][number];

function cardLine(card: NoticeCard): string {
  const named = card.owner ? `${card.title} · ${card.owner}` : card.title;
  if (card.undo?.outcome === "removed") {
    return `~~${card.title}~~ · removed by ${card.undo.by}`;
  }
  if (card.undo?.outcome === "kept") {
    return `${named} · kept: changed on the board`;
  }
  return named;
}

/**
 * What the notice reads: a line per card, and an Undo for each card nobody
 * has undone yet. A card whose id no button can carry is listed without one.
 */
export function noticeContent(notice: ChannelNotice): SpaceNoticeContent {
  return {
    title: "Added to the board",
    lines: notice.cards.map(cardLine),
    actions: notice.cards
      .filter(
        (card) => !card.undo && card.id.length <= SPACE_NOTICE_VALUE_LIMIT,
      )
      .map((card) => ({ label: undoLabel(card.title), value: card.id })),
  };
}

/** The notice as the chat interface posts it, pinning the messages it is about. */
export function noticeRequest(
  conversation: Conversation,
  notice: ChannelNotice,
): SpaceNoticeRequest {
  const sources = [
    ...new Set(notice.cards.flatMap((card) => card.sourceMessageId ?? [])),
  ];
  return {
    ...noticeContent(notice),
    channelId: conversation.channelId,
    interfaceType: conversation.interfaceType,
    reactions: sources.map((messageId) => ({ messageId, emoji: PIN })),
  };
}

/** A bookmark with one of its notices changed; undefined to leave it be. */
export function withNotice(
  bookmark: ChannelBookmark | null,
  key: string,
  change: (notice: ChannelNotice) => ChannelNotice | undefined,
): ChannelBookmark | undefined {
  const notice = bookmark?.notices?.find((candidate) => candidate.key === key);
  if (!bookmark || !notice) return undefined;
  const changed = change(notice);
  if (!changed) return undefined;
  return {
    ...bookmark,
    notices: (bookmark.notices ?? []).map((candidate) =>
      candidate.key === key ? changed : candidate,
    ),
  };
}

/** Post one notice, claiming it first so a concurrent drain skips it. */
async function postNotice(
  deps: ChannelNoticeDeps,
  conversation: Conversation,
  key: string,
): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const claimed = await updateBookmark(deps.bookmarks, conversation.id, (b) =>
    withNotice(b, key, (notice) => {
      if (notice.postedMessageId) return undefined;
      if (
        notice.postingAt &&
        now.getTime() - Date.parse(notice.postingAt) < POSTING_TIMEOUT_MS
      ) {
        return undefined;
      }
      return { ...notice, postingAt: now.toISOString() };
    }),
  );
  if (!claimed) return false;

  const latest = await deps.bookmarks.get(conversation.id);
  const notice = latest?.notices?.find((candidate) => candidate.key === key);
  if (!notice) return false;
  // A failed post is not lost: the notice stays pending (its claim is
  // released below) and the next drain, on the next batch or start, retries.
  const messageId = await deps
    .post(noticeRequest(conversation, notice))
    .catch(() => undefined);
  await updateBookmark(deps.bookmarks, conversation.id, (b) =>
    withNotice(b, key, ({ postingAt: _postingAt, ...rest }) =>
      messageId ? { ...rest, postedMessageId: messageId } : rest,
    ),
  );
  return messageId !== undefined;
}

/** Post a space conversation's pending notices, oldest first. */
export async function postPendingNotices(
  deps: ChannelNoticeDeps,
  conversationId: string,
): Promise<number> {
  const conversation = await deps.conversations.get(conversationId);
  const bookmark = await deps.bookmarks.get(conversationId);
  if (!conversation || !bookmark) return 0;
  const keys = (bookmark.notices ?? [])
    .filter((notice) => !notice.postedMessageId)
    .map((notice) => notice.key);
  const posted = await keys.reduce<Promise<number>>(
    async (count, key) =>
      (await count) + ((await postNotice(deps, conversation, key)) ? 1 : 0),
    Promise.resolve(0),
  );
  return posted;
}

/** How many conversations a start-up drain looks at, newest active first. */
const DRAIN_LIMIT = 500;

/** Post every conversation's pending notices, e.g. after a restart. */
export async function postAllPendingNotices(
  deps: ChannelNoticeDeps,
): Promise<number> {
  const conversations = await deps.conversations.list({ limit: DRAIN_LIMIT });
  const counts = await conversations.reduce<Promise<number>>(
    async (total, conversation) =>
      (await total) + (await postPendingNotices(deps, conversation.id)),
    Promise.resolve(0),
  );
  return counts;
}
