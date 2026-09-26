import { CONVERSATION_SOURCE_TYPE } from "@brains/plugins";

/** Stable position in the conversation database's ascending change stream. */
export interface ConversationChangeCursor {
  readonly updated: string;
  readonly id: string;
}

/** One conversation the poller has to tell the projection runtime about. */
export type ChangedConversation = ConversationChangeCursor;

export interface ConversationPollerState {
  readonly cursor: ConversationChangeCursor | null;
}

export interface ConversationChangeReader {
  getConversationChangeHead(): Promise<ConversationChangeCursor | null>;
  listConversationsUpdatedSince(input: {
    readonly after: ConversationChangeCursor | null;
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
  readonly readState: () => Promise<ConversationPollerState | null>;
  readonly writeState: (state: ConversationPollerState) => Promise<void>;
  readonly now: () => number;
  readonly batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 50;

/**
 * Mark one bounded page of changed conversations.
 *
 * The first call records the current head and intentionally marks nothing:
 * historical model work is an operator action. The state wrapper distinguishes
 * an initialized empty database (`{ cursor: null }`) from no baseline yet.
 */
export function createConversationSourcePoller(
  options: ConversationSourcePollerOptions,
): () => Promise<void> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  return async (): Promise<void> => {
    const state = await options.readState();
    if (state === null) {
      await options.writeState({
        cursor: await options.conversations.getConversationChangeHead(),
      });
      return;
    }

    const changed = await options.conversations.listConversationsUpdatedSince({
      after: state.cursor,
      limit: batchSize,
    });
    if (changed.length === 0) return;

    for (const conversation of changed) {
      await options.markDirty({
        sourceType: CONVERSATION_SOURCE_TYPE,
        sourceId: conversation.id,
        revision: conversation.updated,
        operation: "upsert",
        markedAt: options.now(),
      });
    }

    const last = changed.at(-1);
    if (!last) return;
    await options.writeState({
      cursor: { updated: last.updated, id: last.id },
    });
  };
}
