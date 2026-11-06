import { describe, expect, it, mock } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { channelBookmarks } from "../../../src/lib/channel-action-items/pickup";
import {
  catchUpChannels,
  channelPickupJob,
  finishedPickupOf,
  wakeUpChannel,
  type ChannelTriggerDeps,
} from "../../../src/lib/channel-action-items/trigger";

function conversation(
  id: string,
  interfaceType: string,
  channelId: string,
): Conversation {
  return {
    id,
    sessionId: id,
    interfaceType,
    channelId,
    startedAt: "2026-10-23T09:00:00.000Z",
    lastActiveAt: "2026-10-23T09:00:00.000Z",
    createdAt: "2026-10-23T09:00:00.000Z",
    updatedAt: "2026-10-23T09:00:00.000Z",
    metadata: {},
  };
}

// As the chat interface stores them: the id and channel are the SDK's
// composite channel id; each message carries the space it belongs to.
const ROOM = "discord-discord:guild-1:1466";
const OTHER_ROOM = "discord-discord:guild-1:9999";
const room = conversation(ROOM, "discord", "discord:guild-1:1466");
const otherRoom = conversation(OTHER_ROOM, "discord", "discord:guild-1:9999");
const webChat = conversation("web-1", "web-chat", "session-1");
const counts = new Map([
  [ROOM, 7],
  [OTHER_ROOM, 4],
  ["web-1", 3],
]);
const spaceOf = new Map([
  [ROOM, "discord:1466"],
  [OTHER_ROOM, "discord:9999"],
]);

function lastMessage(id: string): Message {
  const spaceId = spaceOf.get(id);
  return {
    id: `${id}-last`,
    conversationId: id,
    role: "user",
    content: "…",
    timestamp: "2026-10-23T09:00:00.000Z",
    metadata: spaceId ? { spaceId } : {},
  };
}

function deps(): ChannelTriggerDeps & { enqueue: ReturnType<typeof mock> } {
  const all = [room, otherRoom, webChat];
  return {
    conversations: {
      list: async () => all,
      countMessages: async (id) => counts.get(id) ?? 0,
      getMessages: async (id) => [lastMessage(id)],
    },
    spaces: ["discord:1466"],
    bookmarks: channelBookmarks(createMockShell().getRuntimeState()),
    enqueue: mock(async () => {}),
  };
}

describe("waking a channel's pickup", () => {
  it("queues the pickup for a message in a configured space", async () => {
    const trigger = deps();

    await wakeUpChannel(trigger, {
      conversationId: ROOM,
      messageId: "m7",
      role: "user",
      metadata: { spaceId: "discord:1466" },
    });

    expect(trigger.enqueue).toHaveBeenCalledWith(ROOM);
  });

  it("ignores messages outside the configured spaces", async () => {
    const trigger = deps();

    await wakeUpChannel(trigger, { conversationId: "web-1", role: "user" });
    await wakeUpChannel(trigger, {
      conversationId: OTHER_ROOM,
      role: "user",
      metadata: { spaceId: "discord:9999" },
    });
    await wakeUpChannel(trigger, { nothing: true });

    expect(trigger.enqueue).not.toHaveBeenCalled();
  });
});

describe("catching up on channels", () => {
  it("queues every space conversation with messages past its bookmark", async () => {
    const trigger = deps();

    expect(await catchUpChannels(trigger)).toEqual([ROOM]);
    expect(trigger.enqueue).toHaveBeenCalledWith(ROOM);
  });

  it("leaves a space conversation whose bookmark is at its last message", async () => {
    const trigger = deps();
    await trigger.bookmarks.set(ROOM, { processedThrough: 7 });

    expect(await catchUpChannels(trigger)).toEqual([]);
    expect(trigger.enqueue).not.toHaveBeenCalled();
  });
});

describe("the pickup job", () => {
  it("is one pending job per conversation, so a message during a run queues the next", () => {
    expect(channelPickupJob("discord:1466")).toEqual({
      type: "channel-action-items",
      data: { conversationId: "discord:1466" },
      options: {
        deduplication: "skip",
        deduplicationKey: "channel-action-items:discord:1466",
        // Its own operation, so its completion is published for the notice.
        detached: true,
        source: "conversation-memory",
        metadata: {
          operationType: "data_processing",
          operationTarget: "channel-action-items:discord:1466",
          pluginId: "conversation-memory",
        },
      },
    });
  });
});

describe("hearing a pickup finish", () => {
  const job = channelPickupJob(ROOM);
  function finished(overrides: Record<string, unknown> = {}): unknown {
    return {
      id: "job-1",
      type: "job",
      status: "completed",
      metadata: { rootJobId: "job-1", ...job.options.metadata },
      jobDetails: {
        jobType: "conversation-memory:channel-action-items",
        priority: 0,
        retryCount: 0,
      },
      ...overrides,
    };
  }

  it("names the conversation a completed pickup ran for", () => {
    expect(finishedPickupOf(finished())).toBe(ROOM);
  });

  it("ignores a pickup still running or failed", () => {
    expect(
      finishedPickupOf(finished({ status: "processing" })),
    ).toBeUndefined();
    expect(finishedPickupOf(finished({ status: "failed" }))).toBeUndefined();
  });

  it("ignores other jobs", () => {
    expect(
      finishedPickupOf(
        finished({
          jobDetails: { jobType: "link:capture", priority: 0, retryCount: 0 },
        }),
      ),
    ).toBeUndefined();
  });
});
