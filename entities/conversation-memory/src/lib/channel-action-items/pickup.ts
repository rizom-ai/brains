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

type ChannelBookmarkSchema = z.ZodObject<{
  processedThrough: z.ZodNumber;
  claim: z.ZodOptional<
    z.ZodObject<{
      through: z.ZodNumber;
      jobId: z.ZodString;
      at: z.ZodString;
    }>
  >;
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
});

export type ChannelBookmark = z.output<typeof channelBookmarkSchema>;

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

  const claimed: ChannelBookmark = {
    processedThrough: current.processedThrough,
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
  const results = await items.reduce<Promise<string[]>>(
    async (created, item, index) => {
      const done = await created;
      const sameMessage = items
        .slice(0, index)
        .filter((earlier) => earlier.sourcePosition === item.sourcePosition);
      const id = flatId(
        conversationId,
        "message",
        String(item.sourcePosition),
        String(sameMessage.length + 1),
      );
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

  await deps.bookmarks.compareAndSet(conversationId, claimed, {
    processedThrough: count,
  });
  return { status: "processed", through: count, created: results };
}
