import { SPACE_NOTICE_ITEM_LIMIT } from "@brains/contracts";
import {
  ACTION_ITEM_ENTITY_TYPE,
  actionItemSchema,
  actionItemText,
  actionItemTitle,
  createActionItem,
  flatId,
  isBoardOwned,
  reviseActionItem,
  withdrawActionItem,
  type ActionItemAssigneeMember,
} from "@brains/action-items";
import {
  conversationMessageMetadataSchema,
  type ClassRuntimeState,
  type ClassRuntimeStateStore,
  type ContentVisibility,
  type ServiceConversations,
} from "@brains/sdk/internal/service-runtime";
import type { MemoryEntityService } from "../memory-context";
import { z } from "@brains/utils/zod";
import type { ChannelDecisionExtractor } from "./decision-extractor";
import { chatMessageIdOf, sourcePositionOf } from "./messages";
import { pickUpDecisions } from "./decisions";
import type {
  BrainMember,
  ChannelActionItemExtractor,
  FoundActionItem,
  OwnCard,
  PositionedMessage,
} from "./extractor";

type ChannelNoticeSchema = z.ZodObject<{
  key: z.ZodString;
  cards: z.ZodArray<
    z.ZodObject<{
      id: z.ZodString;
      kind: z.ZodOptional<z.ZodEnum<{ decision: "decision" }>>;
      title: z.ZodString;
      owner: z.ZodOptional<z.ZodString>;
      dueDate: z.ZodOptional<z.ZodString>;
      sourceMessageId: z.ZodOptional<z.ZodString>;
      change: z.ZodOptional<
        z.ZodEnum<{ updated: "updated"; withdrawn: "withdrawn" }>
      >;
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
      /** What the line announces; a card when it says nothing. */
      kind: z.enum(["decision"]).optional(),
      title: z.string().min(1),
      owner: z.string().min(1).optional(),
      /** When the card is due, as YYYY-MM-DD. */
      dueDate: z.string().min(1).optional(),
      /** The chat message the card was found in, to pin. */
      sourceMessageId: z.string().min(1).optional(),
      /** What the batch did to an own card; absent for a card it added. */
      change: z.enum(["updated", "withdrawn"]).optional(),
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
  own: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
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
  /**
   * The decisions the pickup wrote, by id: the hash of what it wrote. A
   * decision whose content still has that hash is the pickup's own; one
   * edited since, or not listed here, belongs to whoever edited it. Kept
   * here, not in the decision: its file states nothing a person does not
   * read.
   */
  own: z.record(z.string(), z.string()).optional(),
});

export type ChannelBookmark = z.output<typeof channelBookmarkSchema>;

/**
 * Change a bookmark by compare-and-set, re-reading on a concurrent write.
 * `change` returns undefined to leave it as it is.
 */
export async function updateBookmark(
  bookmarks: ClassRuntimeStateStore<ChannelBookmark>,
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
  runtimeState: ClassRuntimeState,
): ClassRuntimeStateStore<ChannelBookmark> {
  return runtimeState.scoped({
    namespace: "conversation-memory.channel-action-items",
    schema: channelBookmarkSchema,
  });
}

export interface ChannelPickupDeps {
  conversations: Pick<
    ServiceConversations,
    "get" | "getMessages" | "countMessages"
  >;
  bookmarks: ClassRuntimeStateStore<ChannelBookmark>;
  extractor: Pick<ChannelActionItemExtractor, "extract">;
  /** Finds the decisions the messages settle; none are picked up without it. */
  decisions?: Pick<ChannelDecisionExtractor, "extract"> | undefined;
  entityService: Pick<
    MemoryEntityService,
    | "createEntity"
    | "getEntity"
    | "listEntities"
    | "updateEntity"
    | "deleteEntity"
  >;
  /** The visibility the brain gives memory it makes. */
  visibility: ContentVisibility;
  /** The brain's members, who can own the cards the messages name them for. */
  members: () => Promise<BrainMember[]>;
  now?: () => Date;
  /** How long a claim holds before another run may take it over. */
  claimTimeoutMs?: number;
  /** How many earlier messages the model sees as context. */
  contextSize?: number;
}

export type ChannelPickupResult =
  | {
      status: "processed";
      through: number;
      /** The cards it added. */
      created: string[];
      /** The decisions it recorded, when it picks decisions up. */
      decisions?: string[];
    }
  | { status: "up-to-date" }
  | { status: "claimed-elsewhere" }
  | { status: "no-conversation" };

const DEFAULT_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_CONTEXT_SIZE = 10;
/** How many of its most recent open cards the model sees. */
const OWN_CARDS_LIMIT = 30;
/** How many taken-back cards a conversation remembers. */
export const REJECTED_KEPT = 500;
/** How many of its most recent decisions a conversation's pickup can still call its own. */
export const OWN_KEPT = 200;

/** A system actor, for a message whose speaker was not recorded. */
const UNKNOWN_SPEAKER = {
  kind: "service",
  serviceId: "conversation-memory",
} as const;

/**
 * Whether a stored message belongs to a conversation with the brain: its
 * answer, or a request the brain's own turn stored (without the space id the
 * channel capture records). The brain acts on those itself.
 */
function isWithBrain(message: PositionedMessage["message"]): boolean {
  if (message.role !== "user") return true;
  const parsed = conversationMessageMetadataSchema.safeParse(message.metadata);
  return !parsed.success || !parsed.data.spaceId;
}

/**
 * The channel's name: as the newest message records it, since a conversation
 * keeps the name it was started with (once only the channel's id); never the
 * id itself.
 */
function channelNameOf(
  messages: PositionedMessage["message"][],
  conversation: { channelId: string; channelName?: string | undefined },
): string | undefined {
  const named = [...messages]
    .reverse()
    .map(
      (message) =>
        conversationMessageMetadataSchema.safeParse(message.metadata).data
          ?.source?.channelName,
    )
    .find((name) => name && name !== conversation.channelId);
  const fallback = conversation.channelName;
  return named ?? (fallback !== conversation.channelId ? fallback : undefined);
}

function sourceMessageIdOf(item: {
  source: FoundActionItem["source"];
}): string | undefined {
  return chatMessageIdOf(item.source);
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

/** An own card with its owner as a member, for a revision that keeps it. */
type OwnCardWithAssignee = OwnCard & {
  assignee: ActionItemAssigneeMember | undefined;
};

/**
 * The open cards this conversation's pickup made, from messages before
 * `from`, that the board has not touched, newest first: the ones later
 * messages may still change. A card from the range being processed is left
 * out: a run that died after writing it left it unannounced, and it is
 * announced only when its task is found again.
 */
async function ownCards(
  deps: ChannelPickupDeps,
  conversationId: string,
  from: number,
): Promise<OwnCardWithAssignee[]> {
  const prefix = `${flatId(conversationId, "message")}-`;
  const entities = await deps.entityService.listEntities(
    {
      entityType: ACTION_ITEM_ENTITY_TYPE,
      options: {
        filter: {
          metadata: { conversationId, status: "open" },
          visibilityScope: deps.visibility,
        },
        sortFields: [{ field: "created", direction: "desc" }],
        limit: OWN_CARDS_LIMIT,
      },
    },
    actionItemSchema,
  );
  return entities
    .filter((entity) => {
      const position = sourcePositionOf(entity.id, prefix);
      return position !== undefined && position < from && !isBoardOwned(entity);
    })
    .map((entity) => {
      const assignee = entity.metadata.assignedTo?.[0];
      return {
        id: entity.id,
        title: actionItemTitle(entity),
        text: actionItemText(entity),
        owner: assignee?.name,
        dueDate: entity.metadata.dueDate,
        assignee: assignee?.id
          ? { name: assignee.name, id: assignee.id }
          : undefined,
      };
    });
}

type NoticeCard = ChannelNotice["cards"][number];

/** What one notice line announces, so a rerun announces it once. */
function announcement(card: NoticeCard): string {
  return `${card.change ?? "added"}:${card.id}:${card.sourceMessageId ?? ""}`;
}

/**
 * Turn a space conversation's unprocessed messages into cards and decisions.
 * The bookmark alone decides what is processed: a run claims the range,
 * writes what it found (idempotently, by source message), and only then
 * moves the bookmark.
 */
export async function pickUpChannel(
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
    withBrain: isWithBrain(message),
  }));
  const context = positioned.filter(({ position }) => position < from);
  const fresh = positioned.filter(({ position }) => position >= from);
  const own = await ownCards(deps, conversationId, from);
  const { items, updates, withdrawals } = await deps.extractor.extract({
    context,
    fresh,
    members: await deps.members(),
    cards: own,
  });

  const channelName = channelNameOf(messages, conversation);
  const origin = {
    kind: "conversation",
    conversationId,
    interfaceType: conversation.interfaceType,
    channelId: conversation.channelId,
    ...(channelName ? { channelName } : {}),
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
          assignee: item.owner?.assignee,
          dueDate: item.dueDate,
          ...speakerOf(item),
          origin,
        },
      );
      return result.status === "created" ? [...done, result.id] : done;
    },
    Promise.resolve([]),
  );

  const owned = new Map(own.map((card) => [card.id, card]));
  const writer = {
    entityService: deps.entityService,
    visibilityScope: deps.visibility,
  };
  const revisedCards = await updates.reduce<Promise<NoticeCard[]>>(
    async (revisedSoFar, update) => {
      const done = await revisedSoFar;
      const card = owned.get(update.cardId);
      if (!card) return done;
      const owner =
        update.owner === "unchanged"
          ? { name: card.owner, assignee: card.assignee }
          : update.owner === "nobody"
            ? { name: undefined, assignee: undefined }
            : update.owner;
      const assignee = owner.assignee;
      const dueDate =
        update.dueDate === "unchanged"
          ? card.dueDate
          : update.dueDate === "none"
            ? undefined
            : update.dueDate;
      const revised = await reviseActionItem(writer, {
        id: card.id,
        title: update.title,
        text: update.text,
        assignee,
        dueDate,
      });
      if (revised.status !== "revised") return done;
      const sourceMessageId = sourceMessageIdOf(update);
      return [
        ...done,
        {
          id: card.id,
          title: update.title,
          ...(owner.name ? { owner: owner.name } : {}),
          ...(dueDate ? { dueDate } : {}),
          ...(sourceMessageId ? { sourceMessageId } : {}),
          change: "updated" as const,
        },
      ];
    },
    Promise.resolve([]),
  );
  const withdrawnCards = await withdrawals.reduce<Promise<NoticeCard[]>>(
    async (withdrawnSoFar, withdrawal) => {
      const done = await withdrawnSoFar;
      const card = owned.get(withdrawal.cardId);
      if (!card) return done;
      const withdrawn = await withdrawActionItem(writer, card.id);
      if (withdrawn.status !== "removed") return done;
      const sourceMessageId = sourceMessageIdOf(withdrawal);
      return [
        ...done,
        {
          id: card.id,
          title: card.title,
          ...(sourceMessageId ? { sourceMessageId } : {}),
          change: "withdrawn" as const,
        },
      ];
    },
    Promise.resolve([]),
  );

  const decided = deps.decisions
    ? await pickUpDecisions(
        {
          extractor: deps.decisions,
          entityService: deps.entityService,
          visibility: deps.visibility,
        },
        {
          origin: {
            conversationId,
            interfaceType: conversation.interfaceType,
            channelId: conversation.channelId,
            ...(channelName ? { channelName } : {}),
          },
          context,
          fresh,
          rejected,
        },
      )
    : undefined;
  const decisionCards = (decided ?? []).map(
    ({ id, title, sourceMessageId }): NoticeCard => ({
      id,
      kind: "decision",
      title,
      ...(sourceMessageId ? { sourceMessageId } : {}),
    }),
  );
  const written = Object.fromEntries(
    (decided ?? []).flatMap(({ id, hash }) => (hash ? [[id, hash]] : [])),
  );

  // Finish only while the claim is still this run's; announce everything
  // the batch did that no earlier notice lists, so a crashed run's is too.
  await updateBookmark(deps.bookmarks, conversationId, (latest) => {
    if (latest?.claim?.jobId !== jobId) return undefined;
    const notices = latest.notices ?? [];
    const announced = new Set(
      notices.flatMap((notice) => notice.cards.map(announcement)),
    );
    const added = found.map(({ item, id }): NoticeCard => {
      const owner = item.owner?.name;
      const sourceMessageId = sourceMessageIdOf(item);
      return {
        id,
        title: item.title,
        ...(owner ? { owner } : {}),
        ...(item.dueDate ? { dueDate: item.dueDate } : {}),
        ...(sourceMessageId ? { sourceMessageId } : {}),
      };
    });
    const fresh = [
      ...added,
      ...revisedCards,
      ...withdrawnCards,
      ...decisionCards,
    ].filter((card) => !announced.has(announcement(card)));
    const own = Object.fromEntries(
      Object.entries({ ...latest.own, ...written }).slice(-OWN_KEPT),
    );
    const taken = withdrawnCards.map((card) => card.id);
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
      ...(Object.keys(own).length > 0 ? { own } : {}),
      ...(latest.rejected || taken.length > 0
        ? {
            rejected: [
              ...(latest.rejected ?? []).filter((id) => !taken.includes(id)),
              ...taken,
            ].slice(-REJECTED_KEPT),
          }
        : {}),
    };
  });
  return {
    status: "processed",
    through: count,
    created: results,
    ...(decided && {
      decisions: decided.flatMap(({ id, hash }) => (hash ? [id] : [])),
    }),
  };
}
