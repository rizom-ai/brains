import { SPACE_NOTICE_ITEM_LIMIT } from "@brains/contracts";
import {
  createActionItem,
  flatId,
  type ActionItemAssigneeMember,
} from "@brains/action-items";
import type {
  ContentVisibility,
  EntityPluginContext,
  IConversationsNamespace,
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { conversationMessageMetadataSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type {
  ChannelActionItemExtractor,
  FoundActionItem,
  PositionedMessage,
} from "./extractor";

type ChannelNoticeSchema = z.ZodObject<{
  key: z.ZodString;
  cards: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      title: z.ZodString;
      owner: z.ZodOptional<z.ZodString>;
      sourceMessageId: z.ZodOptional<z.ZodString>;
      undo: z.ZodOptional<
        z.ZodObject<{
          outcome: z.ZodEnum<{ removed: "removed"; kept: "kept" }>;
          by: z.ZodString;
        }>
      >;
    }>
  >;
  postingAt: z.ZodOptional<z.ZodString>;
  postedMessageId: z.ZodOptional<z.ZodString>;
}>;

/** The note a batch's cards are announced with, until it is posted. */
const channelNoticeSchema: ChannelNoticeSchema = z.object({
  /** The message range it covers, e.g. "12-17". */
  key: z.string().min(1),
  cards: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      owner: z.string().min(1).optional(),
      /** The chat message the card was found in, to pin. */
      sourceMessageId: z.string().min(1).optional(),
      /** What someone's Undo did: removed it, or kept it as the board changed it. */
      undo: z
        .object({
          outcome: z.enum(["removed", "kept"]),
          by: z.string().min(1),
        })
        .optional(),
    }),
  ),
  /** When a drain started posting it; a fresh one makes others skip it. */
  postingAt: z.string().optional(),
  /** Set once the chat interface has posted it. */
  postedMessageId: z.string().min(1).optional(),
});

export type ChannelNotice = z.output<typeof channelNoticeSchema>;

type ChannelBookmarkSchema = z.ZodObject<{
  processedThrough: z.ZodNumber;
  claim: z.ZodOptional<
    z.ZodObject<{
      through: z.ZodNumber;
      jobId: z.ZodString;
      at: z.ZodString;
    }>
  >;
  notices: z.ZodOptional<z.ZodArray<ChannelNoticeSchema>>;
  rejected: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

const channelBookmarkSchema: ChannelBookmarkSchema = z.object({
  /** The last message position handled. */
  processedThrough: z.number().int().min(0),
  /** The run processing the next batch, up to `through`. */
  claim: z
    .object({
      through: z.number().int().min(1),
      jobId: z.string().min(1),
      at: z.string(),
    })
    .optional(),
  /** Notices still to post, and recent posted ones for Undo. */
  notices: z.array(channelNoticeSchema).optional(),
  /** Cards someone took back with Undo; the pickup never writes them again. */
  rejected: z.array(z.string().min(1)).optional(),
});

export type ChannelBookmark = z.output<typeof channelBookmarkSchema>;

/**
 * Change a bookmark by compare-and-set, re-reading on a concurrent write.
 * `change` returns undefined to leave it as it is.
 */
export async function updateBookmark(
  bookmarks: IRuntimeStateStore<ChannelBookmark>,
  conversationId: string,
  change: (current: ChannelBookmark | null) => ChannelBookmark | undefined,
  attempts = 3,
): Promise<boolean> {
  const current = await bookmarks.get(conversationId);
  const next = change(current);
  if (!next) return false;
  const written = current
    ? await bookmarks.compareAndSet(conversationId, current, next)
    : await bookmarks.setIfNotExists(conversationId, next);
  if (written) return true;
  return attempts > 1
    ? updateBookmark(bookmarks, conversationId, change, attempts - 1)
    : false;
}

/** How many posted notices a bookmark keeps, for Undo on recent cards. */
const POSTED_NOTICES_KEPT = 20;

function keptNotices(notices: ChannelNotice[]): ChannelNotice[] {
  const posted = notices.filter((notice) => notice.postedMessageId);
  const recent = new Set(posted.slice(-POSTED_NOTICES_KEPT));
  return notices.filter(
    (notice) => !notice.postedMessageId || recent.has(notice),
  );
}

/** Per space conversation, how far its pickup got, keyed by conversation id. */
export function channelBookmarks(
  runtimeState: IRuntimeStateNamespace,
): IRuntimeStateStore<ChannelBookmark> {
  return runtimeState.scoped({
    namespace: "conversation-memory.channel-action-items",
    schema: channelBookmarkSchema,
  });
}

export interface ChannelPickupDeps {
  conversations: Pick<
    IConversationsNamespace,
    "get" | "getMessages" | "countMessages"
  >;
  bookmarks: IRuntimeStateStore<ChannelBookmark>;
  extractor: Pick<ChannelActionItemExtractor, "extract">;
  entityService: Pick<
    EntityPluginContext["entityService"],
    "createEntity" | "getEntity"
  >;
  /** The visibility the brain gives memory it makes. */
  visibility: ContentVisibility;
  now?: () => Date;
  /** How long a claim holds before another run may take it over. */
  claimTimeoutMs?: number;
  /** How many earlier messages the model sees as context. */
  contextSize?: number;
}

export type ChannelPickupResult =
  | { status: "processed"; through: number; created: string[] }
  | { status: "up-to-date" }
  | { status: "claimed-elsewhere" }
  | { status: "no-conversation" };

const DEFAULT_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_CONTEXT_SIZE = 10;

/** A system actor, for a message whose speaker was not recorded. */
const UNKNOWN_SPEAKER = {
  kind: "service",
  serviceId: "conversation-memory",
} as const;

/** The member a found item's owner is, when they have a brain account. */
function assigneeOf(
  item: FoundActionItem,
): ActionItemAssigneeMember | undefined {
  const owner = item.owner;
  if (owner?.identity.kind !== "user") return undefined;
  return {
    name: owner.displayName ?? owner.identity.userId,
    id: `user:${owner.identity.userId}`,
  };
}

function sourceMessageIdOf(item: FoundActionItem): string | undefined {
  const parsed = conversationMessageMetadataSchema.safeParse(
    item.source.metadata,
  );
  return parsed.success ? parsed.data.source?.messageId : undefined;
}

function speakerOf(item: FoundActionItem): {
  actor: Parameters<typeof createActionItem>[1]["actor"];
  actorName: string | undefined;
} {
  const parsed = conversationMessageMetadataSchema.safeParse(
    item.source.metadata,
  );
  const actor = parsed.success ? parsed.data.actor : undefined;
  return {
    actor: actor?.identity ?? UNKNOWN_SPEAKER,
    actorName: actor?.displayName,
  };
}

/**
 * Turn a space conversation's unprocessed messages into cards. The bookmark
 * alone decides what is processed: a run claims the range, writes its cards
 * (idempotently, by source message), and only then moves the bookmark.
 */
export async function pickUpChannelActionItems(
  deps: ChannelPickupDeps,
  conversationId: string,
  jobId: string,
): Promise<ChannelPickupResult> {
  const conversation = await deps.conversations.get(conversationId);
  if (!conversation) return { status: "no-conversation" };

  const now = deps.now?.() ?? new Date();
  const count = await deps.conversations.countMessages(conversationId);
  const stored = await deps.bookmarks.get(conversationId);
  const current: ChannelBookmark = stored ?? { processedThrough: 0 };
  if (current.processedThrough >= count) return { status: "up-to-date" };

  const timeout = deps.claimTimeoutMs ?? DEFAULT_CLAIM_TIMEOUT_MS;
  if (current.claim && now.getTime() - Date.parse(current.claim.at) < timeout) {
    return { status: "claimed-elsewhere" };
  }

  // The claim keeps what the bookmark holds, notices still to post included.
  const claimed: ChannelBookmark = {
    ...current,
    claim: { through: count, jobId, at: now.toISOString() },
  };
  const won = stored
    ? await deps.bookmarks.compareAndSet(conversationId, stored, claimed)
    : await deps.bookmarks.setIfNotExists(conversationId, claimed);
  if (!won) return { status: "claimed-elsewhere" };

  const from = current.processedThrough + 1;
  const contextSize = deps.contextSize ?? DEFAULT_CONTEXT_SIZE;
  const firstRead = Math.max(1, from - contextSize);
  const messages = await deps.conversations.getMessages(conversationId, {
    range: { start: firstRead, end: count },
  });
  const positioned: PositionedMessage[] = messages.map((message, index) => ({
    position: firstRead + index,
    message,
  }));
  const items = await deps.extractor.extract({
    context: positioned.filter(({ position }) => position < from),
    fresh: positioned.filter(({ position }) => position >= from),
  });

  const origin = {
    kind: "conversation",
    conversationId,
    interfaceType: conversation.interfaceType,
    channelId: conversation.channelId,
    ...(conversation.channelName
      ? { channelName: conversation.channelName }
      : {}),
  } as const;
  const rejected = new Set(current.rejected ?? []);
  const named = items.map((item, index) => ({
    item,
    id: flatId(
      conversationId,
      "message",
      String(item.sourcePosition),
      String(
        items
          .slice(0, index)
          .filter((earlier) => earlier.sourcePosition === item.sourcePosition)
          .length + 1,
      ),
    ),
  }));
  const found = named.filter(({ id }) => !rejected.has(id));
  const results = await found.reduce<Promise<string[]>>(
    async (created, { item, id }) => {
      const done = await created;
      const result = await createActionItem(
        {
          entityService: deps.entityService,
          visibility: deps.visibility,
          now: () => now,
        },
        {
          id,
          projected: true,
          title: item.title,
          text: item.text,
          assignee: assigneeOf(item),
          ...speakerOf(item),
          origin,
        },
      );
      return result.status === "created" ? [...done, result.id] : done;
    },
    Promise.resolve([]),
  );

  // Finish only while the claim is still this run's; announce every card
  // of the batch no earlier notice lists, so a crashed run's cards are too.
  await updateBookmark(deps.bookmarks, conversationId, (latest) => {
    if (latest?.claim?.jobId !== jobId) return undefined;
    const notices = latest.notices ?? [];
    const announced = new Set(
      notices.flatMap((notice) => notice.cards.map((card) => card.id)),
    );
    const fresh = found
      .filter(({ id }) => !announced.has(id))
      .map(({ item, id }) => {
        const owner = item.owner?.displayName;
        const sourceMessageId = sourceMessageIdOf(item);
        return {
          id,
          title: item.title,
          ...(owner ? { owner } : {}),
          ...(sourceMessageId ? { sourceMessageId } : {}),
        };
      });
    // A notice holds what one chat message can show; a larger batch is
    // announced in several, keyed "12-17", "12-17-2", ...
    const batch: ChannelNotice[] = Array.from(
      { length: Math.ceil(fresh.length / SPACE_NOTICE_ITEM_LIMIT) },
      (_, index) => ({
        key: `${from}-${count}${index > 0 ? `-${index + 1}` : ""}`,
        cards: fresh.slice(
          index * SPACE_NOTICE_ITEM_LIMIT,
          (index + 1) * SPACE_NOTICE_ITEM_LIMIT,
        ),
      }),
    );
    return {
      processedThrough: count,
      notices: keptNotices([...notices, ...batch]),
    };
  });
  return { status: "processed", through: count, created: results };
}
