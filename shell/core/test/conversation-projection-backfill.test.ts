/* eslint-disable @typescript-eslint/explicit-function-return-type -- fixture callbacks stay structurally checked by the production constructor. */
import { describe, expect, it, mock } from "bun:test";
import type { Conversation } from "@brains/conversation-service";
import type { JobsNamespace } from "@brains/job-queue";
import { createSilentLogger } from "@brains/test-utils";
import { ProgressReporter } from "@brains/utils/progress";
import {
  ConversationProjectionBackfill,
  type ConversationProjectionBackfillState,
} from "../src/conversation-projection-backfill";

const timestamp = (second: number): string =>
  `2026-01-01T00:00:${String(second).padStart(2, "0")}.000Z`;

function conversation(id: string, second: number): Conversation {
  return {
    id,
    sessionId: id,
    interfaceType: "mcp",
    channelId: "team",
    personId: null,
    started: timestamp(0),
    lastActive: timestamp(second),
    created: timestamp(0),
    updated: timestamp(second),
    metadata: null,
  };
}

function activeState(
  head = { updated: timestamp(3), id: "c3" },
): ConversationProjectionBackfillState {
  return {
    runId: "run-1",
    status: "active",
    head,
    cursor: null,
    scanned: 0,
    marked: 0,
    jobId: "job-1",
    startedAt: timestamp(0),
    updatedAt: timestamp(0),
    completedAt: null,
    error: null,
  };
}

const reporter =
  ProgressReporter.from(async () => {}) ??
  (((): never => {
    throw new Error("Failed to create progress reporter");
  })() as never);

function createFixture(options: {
  conversations: Conversation[];
  state?: ConversationProjectionBackfillState;
  pageSize?: number;
  pending?: number[];
}) {
  let stored = options.state ?? activeState();
  const marked: unknown[] = [];
  let pendingRead = 0;
  let sleeps = 0;
  const enqueue = mock(async () => "job-new");
  const registerHandler = mock(() => {});
  const jobs: Pick<JobsNamespace, "enqueue" | "getStatus" | "registerHandler"> =
    {
      enqueue,
      getStatus: async () => null,
      registerHandler,
    };
  const backfill = new ConversationProjectionBackfill({
    conversations: {
      getConversationChangeHead: async () =>
        options.conversations.at(-1)
          ? {
              updated: options.conversations.at(-1)?.updated ?? timestamp(0),
              id: options.conversations.at(-1)?.id ?? "none",
            }
          : null,
      listConversationsUpdatedSince: async ({ after, limit }) =>
        options.conversations
          .filter(
            (entry) =>
              !after ||
              entry.updated > after.updated ||
              (entry.updated === after.updated && entry.id > after.id),
          )
          .slice(0, limit),
    },
    projectionStore: {
      getActiveWave: async () => null,
      listPendingInputs: async () => {
        const count = options.pending?.[pendingRead++] ?? 0;
        return Array.from({ length: count }, (_, generation) => ({
          generation,
          sourceType: "conversation",
          sourceId: `pending-${generation}`,
          revision: "1",
          operation: "upsert" as const,
          markedAt: 0,
        }));
      },
      markDirty: async (input) => {
        marked.push(input);
        return marked.length;
      },
    },
    state: {
      get: async () => stored,
      set: async (_key, value) => {
        stored = value;
      },
    },
    jobs,
    logger: createSilentLogger("backfill-test"),
    pageSize: options.pageSize ?? 2,
    now: () => Date.parse(timestamp(10)),
    sleep: async () => {
      sleeps += 1;
    },
  });
  return {
    backfill,
    marked,
    enqueue,
    registerHandler,
    getState: () => stored,
    getSleeps: () => sleeps,
  };
}

describe("conversation projection backfill", () => {
  it("marks bounded pages through its own durable cursor", async () => {
    const fixture = createFixture({
      conversations: [
        conversation("c1", 1),
        conversation("c2", 2),
        conversation("c3", 3),
      ],
      pageSize: 2,
    });

    const result = await fixture.backfill.process(
      "run-1",
      reporter,
      new AbortController().signal,
    );

    expect(fixture.marked).toHaveLength(3);
    expect(result).toMatchObject({
      status: "completed",
      scanned: 3,
      marked: 3,
      cursor: { updated: timestamp(3), id: "c3" },
    });
  });

  it("waits for a marked page to settle before completing", async () => {
    const fixture = createFixture({
      conversations: [conversation("c1", 1)],
      state: activeState({ updated: timestamp(1), id: "c1" }),
      pageSize: 1,
      pending: [0, 1, 0],
    });

    await fixture.backfill.process(
      "run-1",
      reporter,
      new AbortController().signal,
    );

    expect(fixture.getSleeps()).toBe(1);
    expect(fixture.getState().status).toBe("completed");
  });

  it("does not cross the snapshot head into new live changes", async () => {
    const fixture = createFixture({
      conversations: [
        conversation("c1", 1),
        conversation("c2", 2),
        conversation("c3", 3),
      ],
      state: activeState({ updated: timestamp(2), id: "c2" }),
      pageSize: 3,
    });

    await fixture.backfill.process(
      "run-1",
      reporter,
      new AbortController().signal,
    );

    expect(fixture.marked).toHaveLength(2);
    expect(fixture.getState().cursor).toEqual({
      updated: timestamp(2),
      id: "c2",
    });
  });

  it("re-enqueues an active durable run whose job is gone", async () => {
    const fixture = createFixture({
      conversations: [conversation("c1", 1)],
      state: { ...activeState(), jobId: null },
    });

    fixture.backfill.registerHandler();
    await fixture.backfill.resumeActiveRun();

    expect(fixture.registerHandler).toHaveBeenCalledTimes(1);
    expect(fixture.enqueue).toHaveBeenCalledWith({
      type: "conversation-projection-backfill",
      data: { runId: "run-1" },
    });
    expect(fixture.getState().jobId).toBe("job-new");
  });
});
