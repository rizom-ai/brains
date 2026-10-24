import { describe, expect, it, mock } from "bun:test";
import {
  ActionItemAdapter,
  actionItemBody,
  actionItemBodyHash,
  actionItemSchema,
  moveActionItem,
  type ActionItemEntity,
} from "@brains/action-items";
import type { Conversation, Message } from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import type {
  ChannelExtractionResult,
  FoundActionItem,
} from "../../../src/lib/channel-action-items/extractor";
import {
  channelBookmarks,
  pickUpChannelActionItems,
  type ChannelBookmark,
  type ChannelPickupDeps,
} from "../../../src/lib/channel-action-items/pickup";

const CONVERSATION = "discord:1466";
const MEMBERS = [
  { id: "usr_jo", name: "Jo" },
  { id: "usr_niels", name: "Niels" },
];
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

type Speaker =
  | { kind: "user"; userId: string }
  | { kind: "external"; externalActorId: string };

const niels: Speaker = { kind: "user", userId: "usr_niels" };
const jo: Speaker = { kind: "user", userId: "usr_jo" };
const natalie: Speaker = { kind: "external", externalActorId: "ext_natalie" };
const names = new Map([
  ["usr_niels", "Niels"],
  ["usr_jo", "Jo"],
  ["ext_natalie", "Natalie"],
]);

function nameOf(speaker: Speaker): string {
  return (
    names.get(
      speaker.kind === "user" ? speaker.userId : speaker.externalActorId,
    ) ?? ""
  );
}

function message(position: number, speaker: Speaker, content: string): Message {
  return {
    id: `m${position}`,
    conversationId: CONVERSATION,
    role: "user",
    content,
    timestamp: `2026-10-23T09:0${position}:00.000Z`,
    metadata: {
      actor: {
        identity: speaker,
        interfaceType: "discord",
        role: "user",
        displayName: nameOf(speaker),
      },
      source: { messageId: `discord-${position}` },
      spaceId: "discord:1466",
    },
  };
}

const channel: Message[] = [
  message(1, jo, "The INC meeting went well."),
  message(2, niels, "Someone needs to send INC the proposal. Jo, can you?"),
  message(3, jo, "Sure, Friday."),
  message(4, natalie, "I'll book the venue."),
  message(5, niels, "Thanks all."),
];

function brain(messages: Message[] = channel): {
  context: ServicePluginContext;
  deps: ChannelPickupDeps;
  extract: ReturnType<typeof mock>;
  found: (items: FoundActionItem[]) => void;
  revised: (revisions: Omit<ChannelExtractionResult, "items">) => void;
} {
  const context = createServicePluginContext(
    createMockShell(),
    "conversation-memory",
  );
  context.entities.register(
    "action-item",
    actionItemSchema,
    new ActionItemAdapter(),
  );
  const pending: ChannelExtractionResult = {
    items: [],
    updates: [],
    withdrawals: [],
  };
  const extract = mock(async () => ({ ...pending }));
  const deps: ChannelPickupDeps = {
    conversations: {
      get: async (id) => (id === CONVERSATION ? conversation : null),
      countMessages: async () => messages.length,
      getMessages: async (_id, options) => {
        const start = options?.range?.start ?? 1;
        const end = options?.range?.end ?? messages.length;
        return messages.slice(start - 1, end);
      },
    },
    bookmarks: channelBookmarks(context.runtimeState),
    extractor: { extract },
    entityService: context.entityService,
    visibility: "shared",
    members: async () => MEMBERS,
    now: () => NOW,
    contextSize: 2,
  };
  return {
    context,
    deps,
    extract,
    found: (items): void => {
      pending.items = items;
    },
    revised: (revisions): void => {
      pending.updates = revisions.updates;
      pending.withdrawals = revisions.withdrawals;
    },
  };
}

function source(position: number, messages: Message[] = channel): Message {
  const said = messages[position - 1];
  if (!said) throw new Error(`No message ${position}`);
  return said;
}

function item(
  position: number,
  owner: Speaker | undefined,
  title: string,
): FoundActionItem {
  const source = channel[position - 1];
  if (!source) throw new Error(`No message ${position}`);
  return {
    title,
    text: `${title}.`,
    sourcePosition: position,
    source,
    owner: owner
      ? owner.kind === "user"
        ? {
            name: nameOf(owner),
            assignee: { name: nameOf(owner), id: `user:${owner.userId}` },
          }
        : { name: nameOf(owner) }
      : undefined,
  };
}

async function cards(
  context: ServicePluginContext,
): Promise<ActionItemEntity[]> {
  return context.entityService.listEntities(
    {
      entityType: "action-item",
      options: { filter: { visibilityScope: "restricted" } },
    },
    actionItemSchema,
  );
}

async function bookmark(
  deps: ChannelPickupDeps,
): Promise<ChannelBookmark | null> {
  return deps.bookmarks.get(CONVERSATION);
}

describe("picking up a channel's action items", () => {
  it("adds a shared card per item, named by its message, and moves the bookmark", async () => {
    const { context, deps, found } = brain();
    found([item(2, jo, "Send INC the proposal")]);

    const result = await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    expect(result).toEqual({
      status: "processed",
      through: 5,
      created: ["discord-1466-message-2-1"],
    });
    const [card] = await cards(context);
    if (!card) throw new Error("No card was added");
    expect(card.id).toBe("discord-1466-message-2-1");
    expect(card.visibility).toBe("shared");
    expect(card.metadata).toMatchObject({
      origin: "conversation",
      conversationId: CONVERSATION,
      interfaceType: "discord",
      channelId: "1466",
      channelName: "executive-room",
      capturedAt: NOW.toISOString(),
      status: "open",
      requestedBy: [{ name: "Niels", id: "user:usr_niels" }],
      assignedTo: [{ name: "Jo", id: "user:usr_jo" }],
    });
    expect(card.metadata.projectedBodyHash).toBe(
      actionItemBodyHash(card.content),
    );
    expect(await bookmark(deps)).toEqual({
      processedThrough: 5,
      notices: [
        {
          key: "1-5",
          cards: [
            {
              id: "discord-1466-message-2-1",
              title: "Send INC the proposal",
              owner: "Jo",
              sourceMessageId: "discord-2",
            },
          ],
        },
      ],
    });
  });

  it("never recreates a card someone took back", async () => {
    const { context, deps, found } = brain();
    await deps.bookmarks.set(CONVERSATION, {
      processedThrough: 0,
      rejected: ["discord-1466-message-2-1"],
    });
    found([item(2, jo, "Send INC the proposal")]);

    const result = await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    expect(result).toEqual({ status: "processed", through: 5, created: [] });
    expect(await cards(context)).toEqual([]);
    expect((await bookmark(deps))?.notices).toEqual([]);
  });

  it("records no notice when the messages hold no action items", async () => {
    const { deps } = brain();

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    expect(await bookmark(deps)).toEqual({ processedThrough: 5, notices: [] });
  });

  it("splits a batch into notices of at most ten cards", async () => {
    const { deps, found } = brain();
    found(
      Array.from({ length: 12 }, (_, index) =>
        item(2, jo, `Card ${index + 1}`),
      ),
    );

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    const notices = (await bookmark(deps))?.notices ?? [];
    expect(notices.map((notice) => [notice.key, notice.cards.length])).toEqual([
      ["1-5", 10],
      ["1-5-2", 2],
    ]);
  });

  it("keeps a notice still to post when the next batch is processed", async () => {
    const { deps, found } = brain();
    const pending = {
      key: "1-3",
      cards: [{ id: "earlier-card", title: "Earlier card" }],
    };
    await deps.bookmarks.set(CONVERSATION, {
      processedThrough: 3,
      notices: [pending],
    });
    found([item(4, natalie, "Book the venue")]);

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    expect(
      (await bookmark(deps))?.notices?.map((notice) => notice.key),
    ).toEqual(["1-3", "4-5"]);
  });

  it("leaves a card unassigned when its owner has no brain account", async () => {
    const { context, deps, found } = brain();
    found([item(4, natalie, "Book the venue")]);

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    const [card] = await cards(context);
    expect(card?.metadata.assignedTo).toBeUndefined();
    expect(card?.metadata.requestedBy).toEqual([
      { name: "Natalie", id: "external:ext_natalie" },
    ]);
  });

  it("reads only the messages after the bookmark, with earlier ones as context", async () => {
    const { deps, extract } = brain();
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 3 });

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    const [input] = extract.mock.calls[0] ?? [];
    expect(input).toEqual({
      context: [
        { position: 2, message: channel[1], withBrain: false },
        { position: 3, message: channel[2], withBrain: false },
      ],
      fresh: [
        { position: 4, message: channel[3], withBrain: false },
        { position: 5, message: channel[4], withBrain: false },
      ],
      cards: [],
      members: MEMBERS,
    });
  });

  it("marks the messages of a conversation with the brain, which it never cites", async () => {
    // An @mention the brain answered is stored by its own turn: no space id.
    const request: Message = {
      ...message(4, jo, "@brain add an action item: book the venue"),
      metadata: { actor: message(4, jo, "").metadata["actor"] },
    };
    const answer: Message = {
      ...message(5, jo, "Added the card."),
      role: "assistant",
    };
    const { deps, extract } = brain([...channel.slice(0, 3), request, answer]);
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 3 });

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    const [input] = extract.mock.calls[0] ?? [];
    expect(input.fresh).toEqual([
      { position: 4, message: request, withBrain: true },
      { position: 5, message: answer, withBrain: true },
    ]);
  });

  it("assigns a card to the member the messages name", async () => {
    const { context, deps, found } = brain();
    found([
      {
        ...item(2, undefined, "Send INC the proposal"),
        owner: {
          name: "Niels",
          assignee: { name: "Niels", id: "user:usr_niels" },
        },
      },
    ]);

    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    const [card] = await cards(context);
    expect(card?.metadata.assignedTo).toEqual([
      { name: "Niels", id: "user:usr_niels" },
    ]);
    expect((await bookmark(deps))?.notices?.[0]?.cards[0]?.owner).toBe("Niels");
  });

  it("does nothing when every message is processed", async () => {
    const { deps, extract } = brain();
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 5 });

    expect(await pickUpChannelActionItems(deps, CONVERSATION, "job-1")).toEqual(
      {
        status: "up-to-date",
      },
    );
    expect(extract).not.toHaveBeenCalled();
  });

  it("stops while another run holds a fresh claim", async () => {
    const { deps, extract } = brain();
    const held: ChannelBookmark = {
      processedThrough: 1,
      claim: { through: 5, jobId: "job-0", at: "2026-10-23T09:58:00.000Z" },
    };
    await deps.bookmarks.set(CONVERSATION, held);

    expect(await pickUpChannelActionItems(deps, CONVERSATION, "job-1")).toEqual(
      {
        status: "claimed-elsewhere",
      },
    );
    expect(extract).not.toHaveBeenCalled();
    expect(await bookmark(deps)).toEqual(held);
  });

  it("takes over a claim whose run stopped", async () => {
    const { deps, extract } = brain();
    await deps.bookmarks.set(CONVERSATION, {
      processedThrough: 1,
      claim: { through: 5, jobId: "job-0", at: "2026-10-23T09:00:00.000Z" },
    });

    const result = await pickUpChannelActionItems(deps, CONVERSATION, "job-1");

    expect(result).toMatchObject({ status: "processed", through: 5 });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(await bookmark(deps)).toMatchObject({ processedThrough: 5 });
  });

  it("adds no second card when a run repeats the same messages", async () => {
    const { context, deps, found } = brain();
    found([item(2, jo, "Send INC the proposal")]);
    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");
    // A crash before the bookmark moved: the same messages come again.
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 0 });

    const result = await pickUpChannelActionItems(deps, CONVERSATION, "job-2");

    expect(result).toEqual({ status: "processed", through: 5, created: [] });
    expect(await cards(context)).toHaveLength(1);
    // Announced once: the first run's notice already lists the card.
    expect((await bookmark(deps))?.notices).toHaveLength(1);
  });

  it("still announces cards a crashed run wrote but never recorded", async () => {
    const { context, deps, found } = brain();
    found([item(2, jo, "Send INC the proposal")]);
    await pickUpChannelActionItems(deps, CONVERSATION, "job-1");
    // The crash: the card exists, but its notice never reached the bookmark.
    await deps.bookmarks.set(CONVERSATION, { processedThrough: 0 });

    await pickUpChannelActionItems(deps, CONVERSATION, "job-2");

    expect(await cards(context)).toHaveLength(1);
    expect((await bookmark(deps))?.notices).toEqual([
      {
        key: "1-5",
        cards: [
          {
            id: "discord-1466-message-2-1",
            title: "Send INC the proposal",
            owner: "Jo",
            sourceMessageId: "discord-2",
          },
        ],
      },
    ]);
  });
});

describe("revising the channel's own cards", () => {
  const CARD = "discord-1466-message-2-1";

  async function withCard(): Promise<{
    context: ServicePluginContext;
    deps: ChannelPickupDeps;
    extract: ReturnType<typeof mock>;
    found: (items: FoundActionItem[]) => void;
    revised: (revisions: Omit<ChannelExtractionResult, "items">) => void;
    messages: Message[];
  }> {
    const messages = [...channel];
    const pickup = brain(messages);
    pickup.found([item(2, jo, "Send INC the proposal")]);
    await pickUpChannelActionItems(pickup.deps, CONVERSATION, "job-1");
    pickup.found([]);
    messages.push(message(6, niels, "Change of plan: I'll send it Monday."));
    return { ...pickup, messages };
  }

  it("shows the model the open cards it made", async () => {
    const { deps, extract } = await withCard();

    await pickUpChannelActionItems(deps, CONVERSATION, "job-2");

    const [input] = extract.mock.calls[1] ?? [];
    expect(input.cards).toEqual([
      {
        id: CARD,
        title: "Send INC the proposal",
        text: "Send INC the proposal.",
        owner: "Jo",
        assignee: { name: "Jo", id: "user:usr_jo" },
      },
    ]);
  });

  it("revises a card a later message changes and announces it", async () => {
    const { context, deps, revised, messages } = await withCard();
    revised({
      updates: [
        {
          cardId: CARD,
          title: "Send INC the proposal",
          text: "Niels sends INC the proposal on Monday.",
          owner: {
            name: "Niels",
            assignee: { name: "Niels", id: "user:usr_niels" },
          },
          sourcePosition: 6,
          source: source(6, messages),
        },
      ],
      withdrawals: [],
    });

    await pickUpChannelActionItems(deps, CONVERSATION, "job-2");

    const [card] = await cards(context);
    expect(card?.metadata.assignedTo).toEqual([
      { name: "Niels", id: "user:usr_niels" },
    ]);
    expect(actionItemBody(card?.content ?? "")).toContain(
      "Niels sends INC the proposal on Monday.",
    );
    expect((await bookmark(deps))?.notices?.at(-1)).toEqual({
      key: "6-6",
      cards: [
        {
          id: CARD,
          title: "Send INC the proposal",
          owner: "Niels",
          sourceMessageId: "discord-6",
          change: "updated",
        },
      ],
    });
  });

  it("withdraws a card a later message calls off, for good", async () => {
    const { context, deps, revised, messages } = await withCard();
    revised({
      updates: [],
      withdrawals: [
        { cardId: CARD, sourcePosition: 6, source: source(6, messages) },
      ],
    });

    await pickUpChannelActionItems(deps, CONVERSATION, "job-2");

    expect(await cards(context)).toEqual([]);
    const after = await bookmark(deps);
    expect(after?.rejected).toEqual([CARD]);
    expect(after?.notices?.at(-1)?.cards).toEqual([
      {
        id: CARD,
        title: "Send INC the proposal",
        sourceMessageId: "discord-6",
        change: "withdrawn",
      },
    ]);
  });

  it("never shows the model a card the board has moved", async () => {
    const { context, deps, extract } = await withCard();
    await moveActionItem(
      { entityService: context.entityService, visibilityScope: "restricted" },
      { id: CARD, from: "open", to: "doing" },
    );

    await pickUpChannelActionItems(deps, CONVERSATION, "job-2");

    const [input] = extract.mock.calls[1] ?? [];
    expect(input.cards).toEqual([]);
  });
});
