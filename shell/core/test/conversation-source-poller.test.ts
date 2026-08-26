import { describe, expect, it } from "bun:test";
import { createConversationSourcePoller } from "../src/conversation-source-poller";

interface Changed {
  id: string;
  updated: string;
}

function poller(options: { changed: Changed[]; batchSize?: number }): {
  poll: () => Promise<void>;
  marked: Array<{ sourceId: string; revision: string }>;
  watermark: () => string | null;
  scans: Array<string | null>;
} {
  const marked: Array<{ sourceId: string; revision: string }> = [];
  const scans: Array<string | null> = [];
  let watermark: string | null = null;
  return {
    marked,
    scans,
    watermark: (): string | null => watermark,
    poll: createConversationSourcePoller({
      conversations: {
        listConversationsUpdatedSince: async (input): Promise<Changed[]> => {
          scans.push(input.since);
          return options.changed
            .filter((row) => input.since === null || row.updated > input.since)
            .sort((left, right) => left.updated.localeCompare(right.updated))
            .slice(0, input.limit);
        },
      },
      markDirty: async (input): Promise<number> => {
        marked.push({ sourceId: input.sourceId, revision: input.revision });
        return marked.length;
      },
      readWatermark: async (): Promise<string | null> => watermark,
      writeWatermark: async (value): Promise<void> => {
        watermark = value;
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
  it("marks every conversation changed since the watermark", async () => {
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

  it("resumes from where a bounded scan stopped", async () => {
    // The whole reason for ascending order: a descending scan with a limit
    // returns the newest page, so advancing past it strands everything
    // older that still changed after the watermark — permanently.
    const { poll, marked, scans } = poller({ changed, batchSize: 2 });

    await poll();
    expect(marked.map(({ sourceId }) => sourceId)).toEqual(["a", "b"]);

    await poll();
    expect(marked.map(({ sourceId }) => sourceId)).toEqual(["a", "b", "c"]);
    expect(scans[1]).toBe("2026-01-01T00:00:02.000Z");
  });

  it("carries the revision the derivation will be fingerprinted against", async () => {
    const { poll, marked } = poller({ changed });

    await poll();

    expect(marked[0]).toEqual({
      sourceId: "a",
      revision: "2026-01-01T00:00:01.000Z",
    });
  });

  it("leaves the watermark alone when a mark fails", async () => {
    // Crash-safety is the point of polling: a lost tick is caught by the
    // next one, where a best-effort cross-database mark would lose the
    // trigger silently.
    let watermark: string | null = null;
    const poll = createConversationSourcePoller({
      conversations: {
        listConversationsUpdatedSince: async (): Promise<Changed[]> => changed,
      },
      markDirty: async (): Promise<number> => {
        throw new Error("entity database is unavailable");
      },
      readWatermark: async (): Promise<string | null> => watermark,
      writeWatermark: async (value): Promise<void> => {
        watermark = value;
      },
      now: (): number => 1000,
    });

    expect(poll()).rejects.toThrow("entity database is unavailable");
    expect(watermark).toBeNull();
  });
});
