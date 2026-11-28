import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Conversation, Message } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  decisionSchema,
  insightSchema,
  type InsightEntity,
} from "../../../src";
import type { FoundClaim } from "../../../src/lib/channel-pickup/claim-extractor";
import {
  channelBookmarks,
  pickUpChannel,
  type ChannelPickupDeps,
} from "../../../src/lib/channel-pickup/pickup";
import { installConversationMemory } from "../../conversation-memory-plugins";

const CONVERSATION = "discord:1466";

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

function message(position: number, name: string, content: string): Message {
  return {
    id: `m${position}`,
    conversationId: CONVERSATION,
    role: "user",
    content,
    timestamp: `2026-10-23T09:0${position}:00.000Z`,
    metadata: {
      actor: {
        identity: { kind: "user", userId: `usr_${name.toLowerCase()}` },
        interfaceType: "discord",
        role: "user",
        displayName: name,
      },
      source: { messageId: `discord-${position}` },
      spaceId: "discord:1466",
    },
  };
}

const channel: Message[] = [
  message(1, "Jo", "Sign-ups dropped again last week."),
  message(2, "Niels", "I looked: freelancers leave at the company field."),
  message(3, "Jo", "Right, they have no company name to give."),
];

/** A day later the finding turns out wrong. */
const later: Message[] = [
  ...channel,
  message(4, "Niels", "It was the mail server after all: mails bounced."),
];

function learned(
  position: number,
  title: string,
  messages: Message[] = channel,
): FoundClaim {
  const source = messages[position - 1];
  if (!source) throw new Error(`No message ${position}`);
  return {
    kind: "insight",
    title,
    text: `${title}.`,
    sourcePosition: position,
    source,
    by: [
      { identity: { kind: "user", userId: "usr_niels" }, displayName: "Niels" },
    ],
  };
}

describe("picking up a channel's insights", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let found: FoundClaim[];
  let extract: ReturnType<typeof mock>;
  let deps: ChannelPickupDeps;
  let said: Message[];

  async function insights(): Promise<InsightEntity[]> {
    return harness.getEntityService().listEntities(
      {
        entityType: "insight",
        options: { filter: { visibilityScope: "restricted" } },
      },
      insightSchema,
    );
  }

  function pickup(capture: boolean): ChannelPickupDeps {
    return { ...deps, claims: { extractor: { extract }, insights: capture } };
  }

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-insight-pickup" });
    await installConversationMemory(harness);
    found = [];
    said = channel;
    extract = mock(async () => ({ claims: found }));
    const base: ChannelPickupDeps = {
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
      entityService: harness.getEntityService(),
      visibility: "shared",
      members: async () => [],
      contextSize: 2,
    };
    deps = base;
  });

  it("stores a shared, active insight named by its message, by who stated it, and announces it", async () => {
    found = [learned(3, "Freelancers leave at the company field")];

    const result = await pickUpChannel(pickup(true), CONVERSATION, "job-1");

    expect(result).toEqual({
      status: "processed",
      through: 3,
      created: [],
      decisions: [],
      insights: ["discord-1466-insight-3-1"],
    });
    const [stored, ...rest] = await insights();
    expect(rest).toEqual([]);
    expect(stored?.id).toBe("discord-1466-insight-3-1");
    expect(stored?.visibility).toBe("shared");
    expect(stored?.content).toContain(
      "# Freelancers leave at the company field",
    );
    expect(stored?.metadata).toMatchObject({
      conversationId: CONVERSATION,
      interfaceType: "discord",
      channelId: "1466",
      channelName: "executive-room",
      status: "active",
      statedBy: [
        {
          identity: { kind: "user", userId: "usr_niels" },
          displayName: "Niels",
        },
      ],
      mentionedBy: [
        { identity: { kind: "user", userId: "usr_jo" }, displayName: "Jo" },
      ],
    });
    expect(await deps.bookmarks.get(CONVERSATION)).toEqual({
      processedThrough: 3,
      notices: [
        {
          key: "1-3",
          cards: [
            {
              id: "discord-1466-insight-3-1",
              kind: "insight",
              title: "Freelancers leave at the company field",
              sourceMessageId: "discord-3",
            },
          ],
        },
      ],
      own: { "discord-1466-insight-3-1": stored?.contentHash ?? "" },
    });
  });

  it("asks for insights only when they are picked up, and writes none otherwise", async () => {
    found = [learned(3, "Freelancers leave at the company field")];

    const result = await pickUpChannel(pickup(false), CONVERSATION, "job-1");

    const [input] = extract.mock.calls[0] ?? [];
    expect(input.insights).toBe(false);
    expect(result).toEqual({
      status: "processed",
      through: 3,
      created: [],
      decisions: [],
    });
    expect(await insights()).toEqual([]);
  });

  it("numbers a decision and an insight from one message apart", async () => {
    const insight = learned(3, "Freelancers leave at the company field");
    found = [
      insight,
      { ...insight, kind: "decision", title: "Drop the field" },
    ];

    await pickUpChannel(pickup(true), CONVERSATION, "job-1");

    expect((await insights()).map(({ id }) => id)).toEqual([
      "discord-1466-insight-3-1",
    ]);
    const decisions = await harness.getEntityService().listEntities(
      {
        entityType: "decision",
        options: { filter: { visibilityScope: "restricted" } },
      },
      decisionSchema,
    );
    expect(decisions.map(({ id }) => id)).toEqual([
      "discord-1466-decision-3-1",
    ]);
  });

  it("supersedes its own insight when a later finding overturns it", async () => {
    const OLD = "discord-1466-insight-3-1";
    const NEW = "discord-1466-insight-4-1";
    found = [learned(3, "Freelancers leave at the company field")];
    await pickUpChannel(pickup(true), CONVERSATION, "job-1");
    said = later;
    found = [
      {
        ...learned(4, "The mail server dropped the sign-ups", later),
        replaces: { id: OLD, kind: "insight" },
      },
    ];

    await pickUpChannel(pickup(true), CONVERSATION, "job-2");

    const [input] = extract.mock.calls[1] ?? [];
    expect(input.recorded).toEqual([
      expect.objectContaining({ id: OLD, kind: "insight" }),
    ]);
    const stored = await insights();
    expect(stored.find(({ id }) => id === OLD)?.metadata).toMatchObject({
      status: "superseded",
      supersededBy: NEW,
    });
    expect(stored.find(({ id }) => id === NEW)?.metadata.status).toBe("active");
    expect(
      (await deps.bookmarks.get(CONVERSATION))?.notices?.at(-1)?.cards,
    ).toEqual([
      {
        id: NEW,
        kind: "insight",
        title: "The mail server dropped the sign-ups",
        sourceMessageId: "discord-4",
      },
      {
        id: OLD,
        kind: "insight",
        title: "Freelancers leave at the company field",
        sourceMessageId: "discord-4",
        change: "superseded",
      },
    ]);
  });
});
