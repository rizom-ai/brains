import {
  CHAT_CHANNELS,
  JOB_CHANNELS,
  spaceNoticeActionSchema,
  spaceNoticeResultSchema,
} from "@brains/contracts";
import {
  BaseJobHandler,
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  SYSTEM_CHANNELS,
  type ContentVisibility,
  type EntityPluginContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  ChannelActionItemExtractor,
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
  type ChannelPickupDeps,
  type ChannelPickupResult,
} from "./pickup";
import {
  CHANNEL_ACTION_ITEMS_JOB_TYPE,
  catchUpChannels,
  channelPickupJob,
  channelPickupJobDataSchema,
  finishedPickupOf,
  wakeUpChannel,
  type ChannelPickupJobData,
  type ChannelTriggerDeps,
} from "./trigger";
import { undoNoticeCard } from "./undo";

class ChannelPickupHandler extends BaseJobHandler<
  typeof CHANNEL_ACTION_ITEMS_JOB_TYPE,
  ChannelPickupJobData,
  ChannelPickupResult
> {
  private readonly deps: ChannelPickupDeps;

  constructor(logger: Logger, deps: ChannelPickupDeps) {
    super(logger, {
      schema: channelPickupJobDataSchema,
      jobTypeName: CHANNEL_ACTION_ITEMS_JOB_TYPE,
    });
    this.deps = deps;
  }

  async process(
    data: ChannelPickupJobData,
    jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<ChannelPickupResult> {
    return pickUpChannelActionItems(this.deps, data.conversationId, jobId);
  }
}

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
      }),
    )
    .default([]),
  messages: z.array(
    z.object({
      speaker: z.string().min(1),
      /** The speaker's brain account, when they have one. */
      userId: z.string().min(1).optional(),
      content: z.string(),
    }),
  ),
});

/** Channel messages as stored: positioned, each with its speaker. */
function evalChannelMessages(
  input: z.output<typeof evalChannelInputSchema>,
): PositionedMessage[] {
  return input.messages.map((entry, index) => ({
    position: index + 1,
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
 * Action items picked up from configured chat spaces: the job that turns a
 * space's new messages into cards, woken by each stored message, with a
 * catch-up at startup and daily so a lost wake-up only delays a batch. The
 * web process, where the chat app runs, posts each batch's notice when it
 * hears the pickup finish, and at startup whatever a restart left pending;
 * an Undo on a notice takes its card back.
 */
export function registerChannelActionItems(
  context: EntityPluginContext,
  options: { logger: Logger; visibility: ContentVisibility },
): void {
  const bookmarks = channelBookmarks(context.runtimeState);
  context.jobs.registerHandler(
    CHANNEL_ACTION_ITEMS_JOB_TYPE,
    new ChannelPickupHandler(options.logger.child("ChannelActionItems"), {
      conversations: context.conversations,
      bookmarks,
      extractor: new ChannelActionItemExtractor(
        context,
        options.logger.child("ChannelActionItemExtractor"),
      ),
      entityService: context.entityService,
      visibility: options.visibility,
    }),
  );

  const trigger: ChannelTriggerDeps = {
    conversations: context.conversations,
    spaces: context.spaces,
    bookmarks,
    enqueue: async (conversationId) => {
      await context.jobs.enqueue(channelPickupJob(conversationId));
    },
  };
  context.messaging.subscribe(
    CONVERSATION_MESSAGE_ADDED_CHANNEL,
    async (message) => {
      await wakeUpChannel(trigger, message.payload);
      return { success: true };
    },
  );
  const notices: ChannelNoticeDeps = {
    conversations: context.conversations,
    bookmarks,
    post: async (request) => {
      const response = await context.messaging.send({
        type: CHAT_CHANNELS.spaceNotice,
        payload: request,
      });
      if ("noop" in response || !response.success) return undefined;
      return spaceNoticeResultSchema.safeParse(response.data).data?.messageId;
    },
  };
  context.messaging.subscribe(
    CHAT_CHANNELS.spaceNoticeAction,
    async (message) => {
      const action = spaceNoticeActionSchema.safeParse(message.payload);
      if (!action.success) return { noop: true };
      const answer = await undoNoticeCard(
        {
          bookmarks,
          entityService: context.entityService,
          visibility: options.visibility,
        },
        action.data,
      );
      return answer ? { success: true, data: answer } : { noop: true };
    },
  );
  context.messaging.subscribe(JOB_CHANNELS.progress, async (message) => {
    const conversationId = finishedPickupOf(message.payload);
    if (conversationId) await postPendingNotices(notices, conversationId);
    return { success: true };
  });
  context.messaging.subscribe(
    SYSTEM_CHANNELS.startupContentSettled,
    async () => {
      await postAllPendingNotices(notices);
      await catchUpChannels(trigger);
      return { success: true };
    },
  );
  context.eval.registerHandler(
    "extractChannelActionItems",
    async (input: unknown) => {
      const parsed = evalChannelInputSchema.parse(input);
      const positioned = evalChannelMessages(parsed);
      const { items, updates, withdrawals } =
        await new ChannelActionItemExtractor(
          context,
          options.logger.child("ChannelActionItemExtractor"),
        ).extract({
          context: positioned.slice(0, parsed.processedThrough),
          fresh: positioned.slice(parsed.processedThrough),
          cards: parsed.cards.map((card, index) => ({
            ...card,
            id: `card-${index + 1}`,
          })),
        });
      return {
        count: items.length,
        items: items.map((item) => ({
          title: item.title,
          text: item.text,
          message: item.sourcePosition,
          owner: item.owner?.displayName ?? "nobody",
        })),
        updates: updates.map((update) => ({
          card: update.cardId,
          title: update.title,
          text: update.text,
          message: update.sourcePosition,
          owner:
            typeof update.owner === "string"
              ? update.owner
              : (update.owner.displayName ?? "nobody"),
        })),
        withdrawals: withdrawals.map((withdrawal) => ({
          card: withdrawal.cardId,
          message: withdrawal.sourcePosition,
        })),
      };
    },
  );
  context.recurringChecks.register({
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
