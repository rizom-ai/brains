import { describe, expect, it } from "bun:test";
import {
  ActionItemAdapter,
  actionItemSchema,
  createActionItem,
  moveActionItem,
} from "@brains/action-items";
import {
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import {
  channelBookmarks,
  type ChannelNotice,
} from "../../../src/lib/channel-action-items/pickup";
import {
  undoNoticeCard,
  type ChannelUndoDeps,
} from "../../../src/lib/channel-action-items/undo";

const ROOM = "discord-discord:guild-1:1466";

const posted: ChannelNotice = {
  key: "1-5",
  cards: [
    { id: "card-1", title: "Send INC the proposal", owner: "Jo" },
    { id: "card-2", title: "Book the venue" },
  ],
  postedMessageId: "notice-1",
};

async function brain(): Promise<{
  context: ServicePluginContext;
  deps: ChannelUndoDeps;
}> {
  const context = createServicePluginContext(
    createMockShell(),
    "conversation-memory",
  );
  context.entities.register(
    "action-item",
    actionItemSchema,
    new ActionItemAdapter(),
  );
  const deps: ChannelUndoDeps = {
    bookmarks: channelBookmarks(context.runtimeState),
    entityService: context.entityService,
    visibility: "shared",
  };
  await Promise.all(
    posted.cards.map((card) =>
      createActionItem(
        { entityService: context.entityService, visibility: "shared" },
        {
          id: card.id,
          projected: true,
          title: card.title,
          text: `${card.title}.`,
          actor: { kind: "user", userId: "usr_niels" },
          actorName: "Niels",
          origin: {
            kind: "conversation",
            conversationId: ROOM,
            interfaceType: "discord",
            channelId: "discord:guild-1:1466",
          },
        },
      ),
    ),
  );
  await deps.bookmarks.set(ROOM, { processedThrough: 5, notices: [posted] });
  return { context, deps };
}

const click = {
  conversationId: ROOM,
  noticeMessageId: "notice-1",
  value: "card-1",
  by: "Mira",
};

async function card(
  context: ServicePluginContext,
  id: string,
): Promise<unknown> {
  return context.entityService.getEntity({
    entityType: "action-item",
    id,
    visibilityScope: "restricted",
  });
}

describe("undoing a card from its notice", () => {
  it("removes a card only the pickup wrote and strikes it through on the notice", async () => {
    const { context, deps } = await brain();

    const answer = await undoNoticeCard(deps, click);

    expect(answer).toEqual({
      title: "Added to the board",
      lines: ["~~Send INC the proposal~~ · removed by Mira", "Book the venue"],
      actions: [{ label: "Undo: Book the venue", value: "card-2" }],
    });
    expect(await card(context, "card-1")).toBeNull();
    expect((await deps.bookmarks.get(ROOM))?.rejected).toEqual(["card-1"]);
  });

  it("keeps a card the board has moved", async () => {
    const { context, deps } = await brain();
    await moveActionItem(
      { entityService: context.entityService, visibilityScope: "restricted" },
      { id: "card-1", from: "open", to: "doing" },
    );

    const answer = await undoNoticeCard(deps, click);

    expect(answer?.lines[0]).toBe(
      "Send INC the proposal · Jo · kept: changed on the board",
    );
    expect(answer?.actions.map((action) => action.value)).toEqual(["card-2"]);
    expect(await card(context, "card-1")).not.toBeNull();
    expect((await deps.bookmarks.get(ROOM))?.rejected).toBeUndefined();
  });

  it("answers nothing for a notice it did not post", async () => {
    const { deps } = await brain();

    expect(
      await undoNoticeCard(deps, { ...click, noticeMessageId: "elsewhere" }),
    ).toBeUndefined();
  });

  it("changes nothing on a second click", async () => {
    const { deps } = await brain();
    const first = await undoNoticeCard(deps, click);

    const second = await undoNoticeCard(deps, { ...click, by: "Jo" });

    expect(second).toEqual(first);
    expect((await deps.bookmarks.get(ROOM))?.rejected).toEqual(["card-1"]);
  });
});
