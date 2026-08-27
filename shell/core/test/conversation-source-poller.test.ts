import { describe, expect, it } from "bun:test";
import {
  createConversationSourcePoller,
  type ConversationChangeCursor,
  type ConversationPollerState,
} from "../src/conversation-source-poller";

interface Changed {
  id: string;
  updated: string;
}

function afterCursor(
  row: Changed,
  cursor: ConversationChangeCursor | null,
): boolean {
  return (
    cursor === null ||
    row.updated > cursor.updated ||
    (row.updated === cursor.updated && row.id > cursor.id)
  );
}

function poller(options: {
  changed: Changed[];
  batchSize?: number;
  initialized?: boolean;
}): {
  poll: () => Promise<void>;
  marked: Array<{ sourceId: string; revision: string }>;
  state: () => ConversationPollerState | null;
  scans: Array<ConversationChangeCursor | null>;
} {
  const marked: Array<{ sourceId: string; revision: string }> = [];
  const scans: Array<ConversationChangeCursor | null> = [];
  let state: ConversationPollerState | null =
    options.initialized === false ? null : { cursor: null };
  const sorted = [...options.changed].sort(
    (left, right) =>
      left.updated.localeCompare(right.updated) ||
      left.id.localeCompare(right.id),
  );
  return {
    marked,
    scans,
    state: () => state,
    poll: createConversationSourcePoller({
      conversations: {
        getConversationChangeHead: async () => {
          const head = sorted.at(-1);
          return head ? { updated: head.updated, id: head.id } : null;
        },
        listConversationsUpdatedSince: async (input): Promise<Changed[]> => {
          scans.push(input.after);
          return sorted
            .filter((row) => afterCursor(row, input.after))
            .slice(0, input.limit);
        },
      },
      markDirty: async (input): Promise<number> => {
        marked.push({ sourceId: input.sourceId, revision: input.revision });
        return marked.length;
      },
      readState: async () => state,
      writeState: async (value): Promise<void> => {
        state = value;
      },
      now: (): number => 1000,
      ...(options.batchSize !== undefined
        ? { batchSize: options.batchSize }
        : {}),
    }),
  };
}

const changed: Changed[] = [
  { id: "a", updated: "2026-01-01T00:00:01.000Z" },
  { id: "b", updated: "2026-01-01T00:00:02.000Z" },
  { id: "c", updated: "2026-01-01T00:00:03.000Z" },
];

describe("polling conversations for projection", () => {
  it("baselines historical conversations without marking them", async () => {
    const { poll, marked, state } = poller({
      changed,
      initialized: false,
    });

    await poll();

    expect(marked).toEqual([]);
    expect(state()).toEqual({
      cursor: { id: "c", updated: "2026-01-01T00:00:03.000Z" },
    });
  });

  it("marks every conversation after an initialized empty baseline", async () => {
    const { poll, marked } = poller({ changed });

    await poll();

    expect(marked.map(({ sourceId }) => sourceId)).toEqual(["a", "b", "c"]);
  });

  it("does not mark the same change twice", async () => {
    const { poll, marked } = poller({ changed });

    await poll();
    await poll();

    expect(marked).toHaveLength(3);
  });

  it("resumes through a bounded timestamp tie", async () => {
    const tied = changed.map((row) => ({
      ...row,
      updated: "2026-01-01T00:00:01.000Z",
    }));
    const { poll, marked, scans } = poller({
      changed: tied,
      batchSize: 2,
    });

    await poll();
    expect(marked.map(({ sourceId }) => sourceId)).toEqual(["a", "b"]);

    await poll();
    expect(marked.map(({ sourceId }) => sourceId)).toEqual(["a", "b", "c"]);
    expect(scans[1]).toEqual({
      updated: "2026-01-01T00:00:01.000Z",
      id: "b",
    });
  });

  it("carries the revision the derivation is fingerprinted against", async () => {
    const { poll, marked } = poller({ changed });

    await poll();

    expect(marked[0]).toEqual({
      sourceId: "a",
      revision: "2026-01-01T00:00:01.000Z",
    });
  });

  it("leaves the cursor alone when a mark fails", async () => {
    let state: ConversationPollerState | null = { cursor: null };
    const poll = createConversationSourcePoller({
      conversations: {
        getConversationChangeHead: async () => null,
        listConversationsUpdatedSince: async (): Promise<Changed[]> => changed,
      },
      markDirty: async (): Promise<number> => {
        throw new Error("entity database is unavailable");
      },
      readState: async () => state,
      writeState: async (value): Promise<void> => {
        state = value;
      },
      now: (): number => 1000,
    });

    expect(poll()).rejects.toThrow("entity database is unavailable");
    expect(state).toEqual({ cursor: null });
  });
});
