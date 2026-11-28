import {
  SYSTEM_CHANNELS,
  conversationMessageAddedChannel,
  firstPartyJobHandler,
  internalFullScope,
  jobProgressChannel,
  type ContentVisibility,
  type FirstPartyJobHandler,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import {
  spaceNoticeActionContract,
  spaceNoticeContract,
} from "@brains/contracts";
import { ACTION_ITEM_ENTITY_TYPE } from "@brains/action-items";
import { z } from "@brains/utils/zod";
import type { MemoryContext } from "../memory-context";
import {
  ChannelActionItemExtractor,
  type BrainMember,
  type PositionedMessage,
} from "./extractor";
import {
  postAllPendingNotices,
  postPendingNotices,
  type ChannelNoticeDeps,
} from "./notice";
import {
  channelBookmarks,
  pickUpChannelActionItems,
  type ChannelPickupResult,
} from "./pickup";
import {
  CHANNEL_ACTION_ITEMS_JOB_TYPE,
  catchUpChannels,
  channelPickupJob,
  channelPickupJobDataSchema,
  finishedPickupOf,
  wakeUpChannel,
  type ChannelTriggerDeps,
} from "./trigger";
import { undoNoticeCard } from "./undo";

/** What the channel pickup reaches through the package's runtime. */
type ChannelRuntime = Pick<
  ServiceRuntime,
  | "classRuntimeState"
  | "assignableMembers"
  | "spaces"
  | "jobs"
  | "listen"
  | "messaging"
  | "answer"
  | "evalHandler"
  | "recurringCheck"
>;

const evalChannelInputSchema = z.object({
  /** How many leading messages an earlier run already processed. */
  processedThrough: z.number().int().min(0).default(0),
  /** Open cards earlier messages made, named card-1, card-2… */
  cards: z
    .array(
      z.object({
        title: z.string().min(1),
        text: z.string().min(1),
        owner: z.string().min(1).optional(),
        dueDate: z.iso.date().optional(),
      }),
    )
    .default([]),
  /** The brain's members by name; their account ids are derived from it. */
  members: z.array(z.string().min(1)).default([]),
  messages: z.array(
    z.object({
      speaker: z.string().min(1),
      /** The speaker's brain account, when they have one. */
      userId: z.string().min(1).optional(),
      content: z.string(),
      /** Part of a conversation with the brain, e.g. an @mention. */
      withBrain: z.boolean().default(false),
    }),
  ),
});

/** An eval member's account id, as a speaker's `userId` names it. */
function evalMemberId(name: string): string {
  return `usr_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

/** Channel messages as stored: positioned, each with its speaker. */
function evalChannelMessages(
  input: z.output<typeof evalChannelInputSchema>,
): PositionedMessage[] {
  return input.messages.map((entry, index) => ({
    position: index + 1,
    withBrain: entry.withBrain,
    message: {
      id: `eval-channel-${index + 1}`,
      conversationId: "eval-channel",
      role: "user",
      content: entry.content,
      timestamp: new Date(Date.UTC(2026, 9, 23, 9, index)).toISOString(),
      metadata: {
        actor: {
          identity: entry.userId
            ? { kind: "user", userId: entry.userId }
            : { kind: "external", externalActorId: `ext_${entry.speaker}` },
          interfaceType: "discord",
          role: "user",
          displayName: entry.speaker,
        },
      },
    },
  }));
}

/**
 * The job that turns a space conversation's new messages into cards, in
 * every process, under conversation-memory:channel-action-items.
 */
export function channelPickupJobHandler(
  runtime: Pick<ChannelRuntime, "classRuntimeState" | "assignableMembers">,
  context: Pick<
    MemoryContext,
    "logger" | "entityService" | "conversations" | "ai"
  >,
  visibility: ContentVisibility,
): FirstPartyJobHandler {
  const deps = {
    conversations: context.conversations,
    bookmarks: channelBookmarks(runtime.classRuntimeState),
    members: (): Promise<BrainMember[]> => runtime.assignableMembers(),
    extractor: new ChannelActionItemExtractor(
      context,
      context.logger.child("ChannelActionItemExtractor"),
    ),
    entityService: context.entityService,
    visibility,
  };
  return firstPartyJobHandler({
    type: CHANNEL_ACTION_ITEMS_JOB_TYPE,
    input: channelPickupJobDataSchema,
    process: ({ input, jobId }): Promise<ChannelPickupResult> =>
      pickUpChannelActionItems(deps, input.conversationId, jobId),
  });
}

/**
 * Action items picked up from configured chat spaces: the pickup job,
 * woken by each stored message, with a catch-up at startup and daily so a
 * lost wake-up only delays a batch. The web process, where the chat app
 * runs, posts each batch's notice when it hears the pickup finish, and at
 * startup whatever a restart left pending; an Undo on a notice takes its
 * card back.
 */
export function registerChannelActionItems(
  runtime: ChannelRuntime,
  context: Pick<
    MemoryContext,
    "logger" | "entityService" | "conversations" | "ai"
  >,
  options: { visibility: ContentVisibility },
): void {
  const bookmarks = channelBookmarks(runtime.classRuntimeState);
  const trigger: ChannelTriggerDeps = {
    conversations: context.conversations,
    spaces: runtime.spaces,
    bookmarks,
    enqueue: async (conversationId) => {
      await runtime.jobs.enqueue(channelPickupJob(conversationId));
    },
  };
  runtime.listen(conversationMessageAddedChannel, async ({ payload }) => {
    await wakeUpChannel(trigger, payload);
  });
  const notices: ChannelNoticeDeps = {
    conversations: context.conversations,
    bookmarks,
    cardExists: async (id): Promise<boolean> =>
      (await context.entityService.getEntity({
        entityType: ACTION_ITEM_ENTITY_TYPE,
        id,
        visibilityScope: internalFullScope(
          "card existence check for channel notices",
        ),
      })) !== null,
    post: async (request) => {
      const posted = await runtime.messaging.request(
        spaceNoticeContract,
        request,
      );
      return posted.status === "answered" ? posted.data.messageId : undefined;
    },
  };
  // Every plugin hears the click; only the notice's poster has new content.
  runtime.answer(
    spaceNoticeActionContract,
    async ({ request }) =>
      (await undoNoticeCard(
        {
          bookmarks,
          entityService: context.entityService,
          visibility: options.visibility,
        },
        request,
      )) ?? null,
  );
  runtime.listen(jobProgressChannel, async ({ payload }) => {
    const conversationId = finishedPickupOf(payload);
    if (conversationId) await postPendingNotices(notices, conversationId);
  });
  runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
    await postAllPendingNotices(notices);
    await catchUpChannels(trigger);
  });
  runtime.evalHandler("extractChannelActionItems", async (input: unknown) => {
    const parsed = evalChannelInputSchema.parse(input);
    const positioned = evalChannelMessages(parsed);
    const { items, updates, withdrawals } =
      await new ChannelActionItemExtractor(
        context,
        context.logger.child("ChannelActionItemExtractor"),
      ).extract({
        context: positioned.slice(0, parsed.processedThrough),
        fresh: positioned.slice(parsed.processedThrough),
        cards: parsed.cards.map((card, index) => ({
          ...card,
          id: `card-${index + 1}`,
        })),
        members: parsed.members.map((name) => ({
          id: evalMemberId(name),
          name,
        })),
      });
    return {
      count: items.length,
      items: items.map((item) => ({
        title: item.title,
        text: item.text,
        message: item.sourcePosition,
        owner: item.owner?.name ?? "nobody",
        due: item.dueDate ?? "none",
      })),
      updates: updates.map((update) => ({
        card: update.cardId,
        title: update.title,
        text: update.text,
        message: update.sourcePosition,
        owner:
          typeof update.owner === "string" ? update.owner : update.owner.name,
        due: update.dueDate,
      })),
      withdrawals: withdrawals.map((withdrawal) => ({
        card: withdrawal.cardId,
        message: withdrawal.sourcePosition,
      })),
    };
  });
  runtime.recurringCheck({
    id: "channel-action-items-catch-up",
    cadence: "daily",
    deliverAlerts: false,
    includeInInbox: false,
    run: async () => {
      await catchUpChannels(trigger);
      return {};
    },
  });
}
