import type {
  Conversation,
  IConversationsNamespace,
  IRuntimeStateStore,
  JobOptions,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { SUMMARY_PLUGIN_ID } from "../constants";
import { evaluateSummaryEligibility } from "../summary-space-eligibility";
import type { ChannelBookmark } from "./pickup";

export const CHANNEL_ACTION_ITEMS_JOB_TYPE = "channel-action-items";

export const channelPickupJobDataSchema: z.ZodObject<{
  conversationId: z.ZodString;
}> = z.object({ conversationId: z.string().min(1) });

export type ChannelPickupJobData = z.output<typeof channelPickupJobDataSchema>;

/**
 * The pickup job for one conversation. `skip` keeps one pending job per
 * conversation; a message arriving while it runs queues the next.
 */
export function channelPickupJob(conversationId: string): {
  type: typeof CHANNEL_ACTION_ITEMS_JOB_TYPE;
  data: ChannelPickupJobData;
  options: JobOptions;
} {
  const key = `${CHANNEL_ACTION_ITEMS_JOB_TYPE}:${conversationId}`;
  return {
    type: CHANNEL_ACTION_ITEMS_JOB_TYPE,
    data: { conversationId },
    options: {
      deduplication: "skip",
      deduplicationKey: key,
      source: SUMMARY_PLUGIN_ID,
      metadata: {
        operationType: "data_processing",
        operationTarget: key,
        pluginId: SUMMARY_PLUGIN_ID,
      },
    },
  };
}

export interface ChannelTriggerDeps {
  conversations: Pick<
    IConversationsNamespace,
    "get" | "list" | "countMessages"
  >;
  /** The brain's configured spaces, e.g. "discord:<channel id>". */
  spaces: readonly string[];
  bookmarks: IRuntimeStateStore<ChannelBookmark>;
  enqueue: (conversationId: string) => Promise<void>;
}

const messageAddedSchema = z.object({ conversationId: z.string().min(1) });

function inSpace(
  conversation: Conversation,
  spaces: readonly string[],
): boolean {
  return evaluateSummaryEligibility({ conversation, spaces: [...spaces] })
    .eligible;
}

/** A message was stored: queue its conversation's pickup when it is a space. */
export async function wakeUpChannel(
  deps: ChannelTriggerDeps,
  payload: unknown,
): Promise<void> {
  const parsed = messageAddedSchema.safeParse(payload);
  if (!parsed.success || deps.spaces.length === 0) return;
  const conversation = await deps.conversations.get(parsed.data.conversationId);
  if (!conversation || !inSpace(conversation, deps.spaces)) return;
  await deps.enqueue(conversation.id);
}

/** How many conversations one catch-up looks at, newest active first. */
const CATCH_UP_LIMIT = 500;

/**
 * Queue the pickup for every space conversation with messages past its
 * bookmark, so a lost wake-up only delays a batch.
 */
export async function catchUpChannels(
  deps: ChannelTriggerDeps,
): Promise<string[]> {
  if (deps.spaces.length === 0) return [];
  const conversations = await deps.conversations.list({
    limit: CATCH_UP_LIMIT,
  });
  const behind = await Promise.all(
    conversations
      .filter((conversation) => inSpace(conversation, deps.spaces))
      .map(async (conversation) => {
        const [count, bookmark] = await Promise.all([
          deps.conversations.countMessages(conversation.id),
          deps.bookmarks.get(conversation.id),
        ]);
        return count > (bookmark?.processedThrough ?? 0)
          ? [conversation.id]
          : [];
      }),
  );
  const queued = behind.flat();
  await Promise.all(queued.map((id) => deps.enqueue(id)));
  return queued;
}
