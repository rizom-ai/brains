import { describe, expect, it, mock } from "bun:test";
import type { Conversation } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { channelBookmarks } from "../../../src/lib/channel-action-items/pickup";
import {
  catchUpChannels,
  channelPickupJob,
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

const room = conversation("discord:1466", "discord", "1466");
const otherRoom = conversation("discord:9999", "discord", "9999");
const webChat = conversation("web-1", "web-chat", "session-1");
const counts = new Map([
  ["discord:1466", 7],
  ["discord:9999", 4],
  ["web-1", 3],
]);

function deps(): ChannelTriggerDeps & { enqueue: ReturnType<typeof mock> } {
  const all = [room, otherRoom, webChat];
  return {
    conversations: {
      get: async (id) => all.find((candidate) => candidate.id === id) ?? null,
      list: async () => all,
      countMessages: async (id) => counts.get(id) ?? 0,
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
      conversationId: "discord:1466",
      messageId: "m7",
      role: "user",
    });

    expect(trigger.enqueue).toHaveBeenCalledWith("discord:1466");
  });

  it("ignores messages outside the configured spaces", async () => {
    const trigger = deps();

    await wakeUpChannel(trigger, { conversationId: "web-1", role: "user" });
    await wakeUpChannel(trigger, {
      conversationId: "discord:9999",
      role: "user",
    });
    await wakeUpChannel(trigger, { nothing: true });

    expect(trigger.enqueue).not.toHaveBeenCalled();
  });
});

describe("catching up on channels", () => {
  it("queues every space conversation with messages past its bookmark", async () => {
    const trigger = deps();

    expect(await catchUpChannels(trigger)).toEqual(["discord:1466"]);
    expect(trigger.enqueue).toHaveBeenCalledWith("discord:1466");
  });

  it("leaves a space conversation whose bookmark is at its last message", async () => {
    const trigger = deps();
    await trigger.bookmarks.set("discord:1466", { processedThrough: 7 });

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
