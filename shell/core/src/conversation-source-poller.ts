import { CONVERSATION_SOURCE_TYPE } from "@brains/plugins";

/** One conversation the poller has to tell the projection runtime about. */
export interface ChangedConversation {
  readonly id: string;
  readonly updated: string;
}

/**
 * An ascending scan, which is the only shape a watermark can follow.
 *
 * `listConversations` orders by recency and takes a limit, so a scan built on
 * it returns the newest page and strands everything older that also changed —
 * permanently, since the watermark would move past them.
 */
export interface ConversationChangeReader {
  listConversationsUpdatedSince(input: {
    readonly since: string | null;
    readonly limit: number;
  }): Promise<readonly ChangedConversation[]>;
}

export interface ConversationSourcePollerOptions {
  readonly conversations: ConversationChangeReader;
  readonly markDirty: (input: {
    readonly sourceType: string;
    readonly sourceId: string;
    readonly revision: string;
    readonly operation: "upsert";
    readonly markedAt: number;
  }) => Promise<number>;
  readonly readWatermark: () => Promise<string | null>;
  readonly writeWatermark: (value: string) => Promise<void>;
  readonly now: () => number;
  readonly batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 200;

/**
 * Tell the projection runtime which conversations changed.
 *
 * An entity marks itself dirty inside the transaction that changed it, so the
 * two either both happen or neither does. Conversations are in their own
 * database and cannot join that transaction, so this polls instead: a missed
 * tick is picked up by the next one, where a best-effort cross-database write
 * would lose the trigger with nothing to notice it had.
 *
 * The watermark advances only after the marks it covers have landed. Failing
 * mid-batch re-marks a few conversations next tick, which is harmless — a
 * dirty input is deduplicated by the wave, and re-deriving is idempotent.
 * Advancing first would lose them.
 */
export function createConversationSourcePoller(
  options: ConversationSourcePollerOptions,
): () => Promise<void> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  return async (): Promise<void> => {
    const since = await options.readWatermark();
    const changed = await options.conversations.listConversationsUpdatedSince({
      since,
      limit: batchSize,
    });
    if (changed.length === 0) return;

    for (const conversation of changed) {
      await options.markDirty({
        sourceType: CONVERSATION_SOURCE_TYPE,
        sourceId: conversation.id,
        // The revision a derivation is fingerprinted against. `updated`
        // changes whenever the conversation does, which is what makes a
        // repeated wave a memo hit rather than a second model call.
        revision: conversation.updated,
        operation: "upsert",
        markedAt: options.now(),
      });
    }

    const highest = changed
      .map(({ updated }) => updated)
      .reduce((left, right) => (right > left ? right : left));
    await options.writeWatermark(highest);
  };
}
