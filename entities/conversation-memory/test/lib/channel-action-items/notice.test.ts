import { describe, expect, it, mock } from "bun:test";
import type { SpaceNoticeRequest } from "@brains/contracts";
import type { Conversation } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import {
  postAllPendingNotices,
  postPendingNotices,
  type ChannelNoticeDeps,
} from "../../../src/lib/channel-action-items/notice";
import {
  channelBookmarks,
  type ChannelNotice,
} from "../../../src/lib/channel-action-items/pickup";

const ROOM = "discord-discord:guild-1:1466";
const NOW = new Date("2026-10-23T10:00:00.000Z");

const room: Conversation = {
  id: ROOM,
  sessionId: ROOM,
  interfaceType: "discord",
  channelId: "discord:guild-1:1466",
  channelName: "executive-room",
  startedAt: "2026-10-23T09:00:00.000Z",
  lastActiveAt: "2026-10-23T09:00:00.000Z",
  createdAt: "2026-10-23T09:00:00.000Z",
  updatedAt: "2026-10-23T09:00:00.000Z",
  metadata: {},
};

const pending: ChannelNotice = {
  key: "1-5",
  cards: [
    {
      id: "card-1",
      title: "Send INC the proposal",
      owner: "Jo",
      sourceMessageId: "discord-2",
    },
    { id: "card-2", title: "Book the venue", sourceMessageId: "discord-2" },
  ],
};

function deps(
  post: (request: SpaceNoticeRequest) => Promise<string | undefined>,
  gone: string[] = [],
): ChannelNoticeDeps & { post: ReturnType<typeof mock> } {
  return {
    cardExists: async (id) => !gone.includes(id),
    conversations: {
      get: async (id) => (id === ROOM ? room : null),
      list: async () => [room],
    },
    bookmarks: channelBookmarks(createMockShell().getRuntimeState()),
    post: mock(post),
    now: () => NOW,
  };
}

describe("posting a channel's notices", () => {
  it("says when a card is due", async () => {
    const notices = deps(async () => "notice-message-1");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [
        {
          key: "1-5",
          cards: [
            {
              id: "card-1",
              title: "Send INC the proposal",
              owner: "Jo",
              dueDate: "2026-10-28",
            },
          ],
        },
      ],
    });

    await postPendingNotices(notices, ROOM);

    expect(notices.post).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: ["Send INC the proposal · Jo · due Oct 28"],
      }),
    );
  });

  it("leaves out a card no longer on the board", async () => {
    const notices = deps(async () => "notice-message-1", ["card-1"]);
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [pending],
    });

    await postPendingNotices(notices, ROOM);

    expect(notices.post).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: ["Book the venue"],
        actions: [{ label: "Undo: Book the venue", value: "card-2" }],
      }),
    );
  });

  it("drops a notice whose cards are all gone, posting nothing", async () => {
    const notices = deps(async () => "notice-message-1", ["card-1", "card-2"]);
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [pending],
    });

    expect(await postPendingNotices(notices, ROOM)).toBe(0);

    expect(notices.post).not.toHaveBeenCalled();
    expect((await notices.bookmarks.get(ROOM))?.notices).toEqual([]);
  });

  it("posts each pending notice into its space and marks it posted", async () => {
    const notices = deps(async () => "notice-message-1");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [pending],
    });

    expect(await postPendingNotices(notices, ROOM)).toBe(1);

    expect(notices.post).toHaveBeenCalledWith({
      channelId: "discord:guild-1:1466",
      interfaceType: "discord",
      title: "Added to the board",
      lines: ["Send INC the proposal · Jo", "Book the venue"],
      actions: [
        { label: "Undo: Send INC the proposal", value: "card-1" },
        { label: "Undo: Book the venue", value: "card-2" },
      ],
      reactions: [{ messageId: "discord-2", emoji: "📌" }],
    });
    expect((await notices.bookmarks.get(ROOM))?.notices).toEqual([
      { ...pending, postedMessageId: "notice-message-1" },
    ]);
  });

  it("lists a card whose id no button can carry, without an Undo", async () => {
    const notices = deps(async () => "notice-message-1");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [
        {
          key: "1-5",
          cards: [{ id: "x".repeat(83), title: "Book the venue" }],
        },
      ],
    });

    await postPendingNotices(notices, ROOM);

    expect(notices.post).toHaveBeenCalledWith(
      expect.objectContaining({ lines: ["Book the venue"], actions: [] }),
    );
  });

  it("says which cards a batch changed or withdrew, with an Undo only for those still on the board", async () => {
    const notices = deps(async () => "notice-message-1");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [
        {
          key: "6-6",
          cards: [
            {
              id: "card-1",
              title: "Send INC the proposal",
              owner: "Niels",
              change: "updated",
            },
            { id: "card-2", title: "Book the venue", change: "withdrawn" },
          ],
        },
      ],
    });

    await postPendingNotices(notices, ROOM);

    expect(notices.post).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Board updated",
        lines: [
          "Updated: Send INC the proposal · Niels",
          "Withdrawn: ~~Book the venue~~",
        ],
        actions: [{ label: "Undo: Send INC the proposal", value: "card-1" }],
      }),
    );
  });

  it("leaves notices already posted alone", async () => {
    const notices = deps(async () => "again");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [{ ...pending, postedMessageId: "notice-message-1" }],
    });

    expect(await postPendingNotices(notices, ROOM)).toBe(0);
    expect(notices.post).not.toHaveBeenCalled();
  });

  it("skips a notice another drain is posting right now", async () => {
    const notices = deps(async () => "duplicate");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [{ ...pending, postingAt: "2026-10-23T09:59:30.000Z" }],
    });

    expect(await postPendingNotices(notices, ROOM)).toBe(0);
    expect(notices.post).not.toHaveBeenCalled();
  });

  it("keeps a notice whose post failed pending for the next drain", async () => {
    const notices = deps(async () => undefined);
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [pending],
    });

    expect(await postPendingNotices(notices, ROOM)).toBe(0);
    expect((await notices.bookmarks.get(ROOM))?.notices).toEqual([pending]);
  });

  it("posts every conversation's pending notices on start", async () => {
    const notices = deps(async () => "notice-message-1");
    await notices.bookmarks.set(ROOM, {
      processedThrough: 5,
      notices: [pending],
    });

    expect(await postAllPendingNotices(notices)).toBe(1);
  });
});
