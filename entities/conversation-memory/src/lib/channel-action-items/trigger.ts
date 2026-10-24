import {
  JobProgressEventSchema,
  conversationMessageMetadataSchema,
  type IConversationsNamespace,
  type IRuntimeStateStore,
  type JobOptions,
} from "@brains/plugins";
import { matchSpaceSelector } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { SUMMARY_PLUGIN_ID } from "../constants";
import type { ChannelBookmark } from "./pickup";

export const CHANNEL_ACTION_ITEMS_JOB_TYPE = "channel-action-items";

/** The job's type as the queue records it, prefixed with the plugin id. */
const QUEUED_JOB_TYPE = `${SUMMARY_PLUGIN_ID}:${CHANNEL_ACTION_ITEMS_JOB_TYPE}`;
const KEY_PREFIX = `${CHANNEL_ACTION_ITEMS_JOB_TYPE}:`;

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
  const key = `${KEY_PREFIX}${conversationId}`;
  return {
    type: CHANNEL_ACTION_ITEMS_JOB_TYPE,
    data: { conversationId },
    options: {
      deduplication: "skip",
      deduplicationKey: key,
      // Woken by a message, but not a step of handling it: detached, the
      // job is its own operation, so its completion is published and the
      // web process posts the notice.
      detached: true,
      source: SUMMARY_PLUGIN_ID,
      metadata: {
        operationType: "data_processing",
        operationTarget: key,
        pluginId: SUMMARY_PLUGIN_ID,
      },
    },
  };
}

/**
 * The conversation a job progress event reports a finished pickup for. The
 * web process hears every process's job completions, so this is how it
 * learns a worker's pickup recorded notices to post.
 */
export function finishedPickupOf(payload: unknown): string | undefined {
  const event = JobProgressEventSchema.safeParse(payload);
  if (!event.success) return undefined;
  const { status, jobDetails, metadata } = event.data;
  if (status !== "completed" || jobDetails?.jobType !== QUEUED_JOB_TYPE) {
    return undefined;
  }
  const target = metadata.operationTarget;
  return target?.startsWith(KEY_PREFIX)
    ? target.slice(KEY_PREFIX.length)
    : undefined;
}

export interface ChannelTriggerDeps {
  conversations: Pick<
    IConversationsNamespace,
    "list" | "countMessages" | "getMessages"
  >;
  /** The brain's configured spaces, e.g. "discord:<channel id>". */
  spaces: readonly string[];
  bookmarks: IRuntimeStateStore<ChannelBookmark>;
  enqueue: (conversationId: string) => Promise<void>;
}

const messageAddedSchema = z.object({
  conversationId: z.string().min(1),
  metadata: z.unknown().optional(),
});

/** The configured space a stored message belongs to, as the chat interface recorded it. */
function spaceIdOf(metadata: unknown): string | undefined {
  const parsed = conversationMessageMetadataSchema.safeParse(metadata ?? {});
  return parsed.success ? parsed.data.spaceId : undefined;
}

function inSpace(
  spaceId: string | undefined,
  spaces: readonly string[],
): boolean {
  return (
    spaceId !== undefined &&
    spaces.some((selector) => matchSpaceSelector(selector, spaceId))
  );
}

/** A message was stored: queue its conversation's pickup when it is in a space. */
export async function wakeUpChannel(
  deps: ChannelTriggerDeps,
  payload: unknown,
): Promise<void> {
  const parsed = messageAddedSchema.safeParse(payload);
  if (!parsed.success) return;
  if (!inSpace(spaceIdOf(parsed.data.metadata), deps.spaces)) return;
  await deps.enqueue(parsed.data.conversationId);
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
    conversations.map(async (conversation) => {
      const [count, bookmark] = await Promise.all([
        deps.conversations.countMessages(conversation.id),
        deps.bookmarks.get(conversation.id),
      ]);
      if (count <= (bookmark?.processedThrough ?? 0)) return [];
      const [latest] = await deps.conversations.getMessages(conversation.id, {
        range: { start: count, end: count },
      });
      return inSpace(spaceIdOf(latest?.metadata), deps.spaces)
        ? [conversation.id]
        : [];
    }),
  );
  const queued = behind.flat();
  await Promise.all(queued.map((id) => deps.enqueue(id)));
  return queued;
}
