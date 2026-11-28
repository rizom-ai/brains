import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { decisionSchema, type DecisionEntity } from "../../../src";
import type { FoundClaim } from "../../../src/lib/channel-pickup/claim-extractor";
import {
  channelBookmarks,
  pickUpChannel,
  type ChannelPickupDeps,
} from "../../../src/lib/channel-pickup/pickup";
import { installConversationMemory } from "../../conversation-memory-plugins";

const CONVERSATION = "discord:1466";
const NOW = new Date("2026-10-23T10:00:00.000Z");

const conversation: Conversation = {
  id: CONVERSATION,
  sessionId: CONVERSATION,
  interfaceType: "discord",
  channelId: "1466",
  channelName: "executive-room",
  startedAt: "2026-10-23T09:00:00.000Z",
  lastActiveAt: "2026-10-23T09:05:00.000Z",
  createdAt: "2026-10-23T09:00:00.000Z",
  updatedAt: "2026-10-23T09:05:00.000Z",
  metadata: {},
};

const jo = { userId: "usr_jo", name: "Jo" };
const niels = { userId: "usr_niels", name: "Niels" };

function message(
  position: number,
  speaker: { userId: string; name: string },
  content: string,
): Message {
  return {
    id: `m${position}`,
    conversationId: CONVERSATION,
    role: "user",
    content,
    timestamp: `2026-10-23T09:0${position}:00.000Z`,
    metadata: {
      actor: {
        identity: { kind: "user", userId: speaker.userId },
        interfaceType: "discord",
        role: "user",
        displayName: speaker.name,
      },
      source: { messageId: `discord-${position}` },
      spaceId: "discord:1466",
    },
  };
}

const channel: Message[] = [
  message(1, jo, "Sign-ups dropped again last week."),
  message(2, niels, "Shall we drop the company field from the form?"),
  message(3, jo, "Yes, let's drop it."),
];

/** The channel a day later: the team comes back on what it decided. */
const later: Message[] = [
  ...channel,
  message(4, niels, "We need the company name for invoicing after all."),
  message(5, jo, "Then we keep the company field."),
];

function decided(
  position: number,
  title: string,
  messages: Message[] = channel,
): FoundClaim {
  const source = messages[position - 1];
  if (!source) throw new Error(`No message ${position}`);
  return {
    kind: "decision",
    title,
    text: `${title}.`,
    sourcePosition: position,
    source,
    by: [
      { identity: { kind: "user", userId: "usr_niels" }, displayName: "Niels" },
    ],
  };
}

describe("picking up a channel's decisions", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let found: FoundClaim[];
  let extract: ReturnType<typeof mock>;
  let deps: ChannelPickupDeps;
  /** The messages the conversation holds right now. */
  let said: Message[];

  async function decisions(): Promise<DecisionEntity[]> {
    return harness.getEntityService().listEntities(
      {
        entityType: "decision",
        options: { filter: { visibilityScope: "restricted" } },
      },
      decisionSchema,
    );
  }

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-decision-pickup" });
    await installConversationMemory(harness);
    found = [];
    said = channel;
    extract = mock(async () => ({ claims: found }));
    const pickup: ChannelPickupDeps = {
      conversations: {
        get: async (id) => (id === CONVERSATION ? conversation : null),
        countMessages: async () => said.length,
        getMessages: async (_id, options) =>
          said.slice(
            (options?.range?.start ?? 1) - 1,
            options?.range?.end ?? said.length,
          ),
      },
      bookmarks: channelBookmarks(harness.getMockShell().getRuntimeState()),
      extractor: {
        extract: async () => ({ items: [], updates: [], withdrawals: [] }),
      },
      claims: { extractor: { extract }, insights: false },
      entityService: harness.getEntityService(),
      visibility: "shared",
      members: async () => [],
      now: () => NOW,
      contextSize: 2,
    };
    deps = pickup;
  });

  it("stores a shared, active decision named by its message, from its conversation", async () => {
    found = [decided(3, "Drop the company field")];

    const result = await pickUpChannel(deps, CONVERSATION, "job-1");

    expect(result).toEqual({
      status: "processed",
      through: 3,
      created: [],
      decisions: ["discord-1466-decision-3-1"],
    });
    const [stored, ...rest] = await decisions();
    expect(rest).toEqual([]);
    expect(stored?.id).toBe("discord-1466-decision-3-1");
    expect(stored?.visibility).toBe("shared");
    expect(stored?.content).toContain("# Drop the company field");
    expect(stored?.content).toContain("Drop the company field.");
    expect(stored?.metadata).toMatchObject({
      conversationId: CONVERSATION,
      interfaceType: "discord",
      channelId: "1466",
      channelName: "executive-room",
      timeRange: {
        start: "2026-10-23T09:03:00.000Z",
        end: "2026-10-23T09:03:00.000Z",
      },
      status: "active",
      decidedBy: [
        {
          identity: { kind: "user", userId: "usr_niels" },
          displayName: "Niels",
        },
      ],
      // Jo said it; Niels, who decided, is not also named as mentioning it.
      mentionedBy: [
        { identity: { kind: "user", userId: "usr_jo" }, displayName: "Jo" },
      ],
    });
  });

  it("records a notice for the decision and what it wrote, for Undo", async () => {
    found = [decided(3, "Drop the company field")];

    await pickUpChannel(deps, CONVERSATION, "job-1");

    const [stored] = await decisions();
    expect(await deps.bookmarks.get(CONVERSATION)).toEqual({
      processedThrough: 3,
      notices: [
        {
          key: "1-3",
          cards: [
            {
              id: "discord-1466-decision-3-1",
              kind: "decision",
              title: "Drop the company field",
              sourceMessageId: "discord-3",
            },
          ],
        },
      ],
      own: { "discord-1466-decision-3-1": stored?.contentHash ?? "" },
    });
  });

  it("announces a decision a crashed run wrote and never announced", async () => {
    found = [decided(3, "Drop the company field")];
    await pickUpChannel(deps, CONVERSATION, "job-1");
    // The run wrote its decision and died before it moved the bookmark.
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 0 });

    await pickUpChannel(deps, CONVERSATION, "job-2");

    // The decisions of the range being processed are not "already recorded".
    const [input] = extract.mock.calls[1] ?? [];
    expect(input.recorded).toEqual([]);
    expect(await decisions()).toHaveLength(1);
    expect((await deps.bookmarks.get(CONVERSATION))?.notices).toEqual([
      {
        key: "1-3",
        cards: [
          {
            id: "discord-1466-decision-3-1",
            kind: "decision",
            title: "Drop the company field",
            sourceMessageId: "discord-3",
          },
        ],
      },
    ]);
  });

  it("shows the extractor the new messages, their context and the channel's active decisions", async () => {
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 2 });
    await harness.getEntityService().createEntity({
      entity: {
        id: "keep-the-newsletter-weekly",
        entityType: "decision",
        visibility: "shared",
        content: "# Keep the newsletter weekly\n\nIt stays weekly.",
        metadata: {
          conversationId: CONVERSATION,
          channelId: "1466",
          interfaceType: "discord",
          status: "active",
        },
      },
    });

    await pickUpChannel(deps, CONVERSATION, "job-1");

    const [input] = extract.mock.calls[0] ?? [];
    expect(
      input.context.map((entry: { position: number }) => entry.position),
    ).toEqual([1, 2]);
    expect(
      input.fresh.map((entry: { position: number }) => entry.position),
    ).toEqual([3]);
    expect(input.insights).toBe(false);
    expect(input.recorded).toEqual([
      {
        id: "keep-the-newsletter-weekly",
        kind: "decision",
        title: "Keep the newsletter weekly",
        text: "It stays weekly.",
      },
    ]);
  });

  it("writes a decision once when its range is processed again", async () => {
    found = [decided(3, "Drop the company field")];
    await pickUpChannel(deps, CONVERSATION, "job-1");
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 0 });

    const again = await pickUpChannel(deps, CONVERSATION, "job-2");

    expect(again).toMatchObject({ status: "processed", decisions: [] });
    expect(await decisions()).toHaveLength(1);
  });

  it("numbers the decisions one message settles", async () => {
    found = [
      decided(3, "Drop the company field"),
      decided(3, "Keep the email field"),
    ];

    await pickUpChannel(deps, CONVERSATION, "job-1");

    expect((await decisions()).map((decision) => decision.id).sort()).toEqual([
      "discord-1466-decision-3-1",
      "discord-1466-decision-3-2",
    ]);
  });

  it("never recreates a decision someone took back", async () => {
    await deps.bookmarks.set(CONVERSATION, {
      processedThrough: 0,
      rejected: ["discord-1466-decision-3-1"],
    });
    found = [decided(3, "Drop the company field")];

    await pickUpChannel(deps, CONVERSATION, "job-1");

    expect(await decisions()).toEqual([]);
  });

  it("leaves the bookmark where it was when the extraction fails", async () => {
    extract.mockRejectedValueOnce(new Error("model unavailable"));

    const failure: unknown = await pickUpChannel(
      deps,
      CONVERSATION,
      "job-1",
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toEqual(new Error("model unavailable"));
    expect((await deps.bookmarks.get(CONVERSATION))?.processedThrough).toBe(0);
  });

  describe("when later messages overturn a decision", () => {
    const OLD = "discord-1466-decision-3-1";
    const NEW = "discord-1466-decision-5-1";

    async function byId(id: string): Promise<DecisionEntity | undefined> {
      return (await decisions()).find((decision) => decision.id === id);
    }

    /** The channel decided to drop the field; then it comes back on that. */
    async function overturned(): Promise<void> {
      found = [decided(3, "Drop the company field")];
      await pickUpChannel(deps, CONVERSATION, "job-1");
      said = later;
      found = [
        {
          ...decided(5, "Keep the company field", later),
          replaces: { id: OLD, kind: "decision" },
        },
      ];
    }

    it("supersedes the decision it wrote, naming what replaced it", async () => {
      await overturned();

      await pickUpChannel(deps, CONVERSATION, "job-2");

      expect((await byId(OLD))?.metadata).toMatchObject({
        status: "superseded",
        supersededBy: NEW,
      });
      expect((await byId(NEW))?.metadata.status).toBe("active");
      const bookmark = await deps.bookmarks.get(CONVERSATION);
      expect(bookmark?.notices?.at(-1)).toEqual({
        key: "4-5",
        cards: [
          {
            id: NEW,
            kind: "decision",
            title: "Keep the company field",
            sourceMessageId: "discord-5",
          },
          {
            id: OLD,
            kind: "decision",
            title: "Drop the company field",
            sourceMessageId: "discord-5",
            change: "superseded",
          },
        ],
      });
      // Both are still the pickup's own, the old one as it now reads.
      expect(bookmark?.own).toEqual({
        [OLD]: (await byId(OLD))?.contentHash ?? "",
        [NEW]: (await byId(NEW))?.contentHash ?? "",
      });
    });

    it("never changes a decision someone has edited", async () => {
      await overturned();
      const old = await byId(OLD);
      if (!old) throw new Error("The first decision was not stored");
      await harness.getEntityService().updateEntity({
        entity: {
          ...old,
          content: "# Drop the company field\n\nOnly for freelancers.",
        },
      });

      await pickUpChannel(deps, CONVERSATION, "job-2");

      const kept = await byId(OLD);
      expect(kept?.metadata.status).toBe("active");
      expect(kept?.metadata.supersededBy).toBeUndefined();
      expect(kept?.content).toContain("Only for freelancers.");
      // The new decision is recorded all the same.
      expect((await byId(NEW))?.metadata.status).toBe("active");
      expect(
        (await deps.bookmarks.get(CONVERSATION))?.notices?.at(-1)?.cards,
      ).toHaveLength(1);
    });

    it("leaves a decision alone when what replaces it was taken back", async () => {
      await overturned();
      const bookmark = await deps.bookmarks.get(CONVERSATION);
      await deps.bookmarks.set(CONVERSATION, {
        ...bookmark,
        processedThrough: 3,
        rejected: [NEW],
      });

      await pickUpChannel(deps, CONVERSATION, "job-2");

      expect((await byId(OLD))?.metadata.status).toBe("active");
      expect(await byId(NEW)).toBeUndefined();
    });
  });

  it("picks up no decisions when the pickup is given no decision extractor", async () => {
    const { claims: _none, ...cardsOnly } = deps;

    const result = await pickUpChannel(cardsOnly, CONVERSATION, "job-1");

    expect(result).toEqual({ status: "processed", through: 3, created: [] });
    expect(extract).not.toHaveBeenCalled();
  });
});
