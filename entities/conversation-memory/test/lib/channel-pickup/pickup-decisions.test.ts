import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { decisionSchema, type DecisionEntity } from "../../../src";
import type { FoundDecision } from "../../../src/lib/channel-pickup/decision-extractor";
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

function decided(position: number, title: string): FoundDecision {
  const source = channel[position - 1];
  if (!source) throw new Error(`No message ${position}`);
  return {
    title,
    text: `${title}.`,
    sourcePosition: position,
    source,
    decidedBy: [
      { identity: { kind: "user", userId: "usr_niels" }, displayName: "Niels" },
    ],
  };
}

describe("picking up a channel's decisions", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let found: FoundDecision[];
  let extract: ReturnType<typeof mock>;
  let deps: ChannelPickupDeps;

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
    extract = mock(async () => ({ decisions: found }));
    const pickup: ChannelPickupDeps = {
      conversations: {
        get: async (id) => (id === CONVERSATION ? conversation : null),
        countMessages: async () => channel.length,
        getMessages: async (_id, options) =>
          channel.slice(
            (options?.range?.start ?? 1) - 1,
            options?.range?.end ?? channel.length,
          ),
      },
      bookmarks: channelBookmarks(harness.getMockShell().getRuntimeState()),
      extractor: {
        extract: async () => ({ items: [], updates: [], withdrawals: [] }),
      },
      decisions: { extract },
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
    expect(input.decisions).toEqual([
      {
        id: "keep-the-newsletter-weekly",
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

  it("picks up no decisions when the pickup is given no decision extractor", async () => {
    const { decisions: _none, ...cardsOnly } = deps;

    const result = await pickUpChannel(cardsOnly, CONVERSATION, "job-1");

    expect(result).toEqual({ status: "processed", through: 3, created: [] });
    expect(extract).not.toHaveBeenCalled();
  });
});
