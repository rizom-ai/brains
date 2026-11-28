import { beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { decisionSchema, type DecisionEntity } from "../../../src";
import {
  channelBookmarks,
  type ChannelNotice,
} from "../../../src/lib/channel-pickup/pickup";
import {
  undoNoticeCard,
  type ChannelUndoDeps,
} from "../../../src/lib/channel-pickup/undo";
import { installConversationMemory } from "../../conversation-memory-plugins";

const ROOM = "discord-discord:guild-1:1466";
const ID = "discord-1466-decision-3-1";

const posted: ChannelNotice = {
  key: "1-3",
  cards: [{ id: ID, kind: "decision", title: "Drop the company field" }],
  postedMessageId: "notice-1",
};

const click = {
  conversationId: ROOM,
  noticeMessageId: "notice-1",
  value: ID,
  by: "Jo",
};

describe("undoing a decision from its notice", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let deps: ChannelUndoDeps;

  async function stored(): Promise<DecisionEntity | null> {
    return harness.getEntityService().getEntity(
      {
        entityType: "decision",
        id: ID,
        visibilityScope: "restricted",
      },
      decisionSchema,
    );
  }

  /** The decision as the pickup wrote it, and whether the bookmark says so. */
  async function pickedUp(options: { recorded: boolean }): Promise<void> {
    await harness.getEntityService().createEntity({
      entity: {
        id: ID,
        entityType: "decision",
        visibility: "shared",
        content: "# Drop the company field\n\nThe form no longer asks for it.",
        metadata: {
          conversationId: ROOM,
          channelId: "discord:guild-1:1466",
          interfaceType: "discord",
          status: "active",
        },
      },
    });
    const written = await stored();
    if (!written) throw new Error("The decision was not stored");
    await deps.bookmarks.set(ROOM, {
      processedThrough: 3,
      notices: [posted],
      ...(options.recorded && { own: { [ID]: written.contentHash } }),
    });
  }

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-decision-undo" });
    await installConversationMemory(harness);
    deps = {
      bookmarks: channelBookmarks(harness.getMockShell().getRuntimeState()),
      entityService: harness.getEntityService(),
      visibility: "shared",
    };
  });

  it("removes a decision only the pickup wrote, and never lets it be written again", async () => {
    await pickedUp({ recorded: true });

    const answer = await undoNoticeCard(deps, click);

    expect(await stored()).toBeNull();
    expect(answer?.lines).toEqual([
      "~~Drop the company field~~ · removed by Jo",
    ]);
    const bookmark = await deps.bookmarks.get(ROOM);
    expect(bookmark?.rejected).toEqual([ID]);
    expect(bookmark?.own).toEqual({});
  });

  it("keeps a decision someone has edited", async () => {
    await pickedUp({ recorded: true });
    const written = await stored();
    if (!written) throw new Error("The decision was not stored");
    await harness.getEntityService().updateEntity({
      entity: {
        ...written,
        content: "# Drop the company field\n\nOnly for freelancers.",
      },
    });

    const answer = await undoNoticeCard(deps, click);

    expect((await stored())?.content).toContain("Only for freelancers.");
    expect(answer?.lines).toEqual([
      "Decision: Drop the company field · kept: edited since",
    ]);
    expect((await deps.bookmarks.get(ROOM))?.rejected).toBeUndefined();
  });

  it("keeps a decision the bookmark has no record of writing", async () => {
    await pickedUp({ recorded: false });

    await undoNoticeCard(deps, click);

    expect(await stored()).not.toBeNull();
  });
});
