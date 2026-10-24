import { describe, expect, it, spyOn } from "bun:test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import type { Message } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import {
  ChannelActionItemExtractor,
  type PositionedMessage,
} from "../../../src/lib/channel-action-items/extractor";

function said(
  position: number,
  speaker: { userId: string; name: string } | "guest",
  content: string,
  withBrain = false,
): PositionedMessage {
  const message: Message = {
    id: `m${position}`,
    conversationId: "discord:1466",
    role: "user",
    content,
    timestamp: `2026-10-23T09:0${position % 10}:00.000Z`,
    metadata: {
      actor:
        speaker === "guest"
          ? {
              identity: { kind: "external", externalActorId: "ext_guest" },
              interfaceType: "discord",
              role: "user",
              displayName: "Natalie",
            }
          : {
              identity: { kind: "user", userId: speaker.userId },
              interfaceType: "discord",
              role: "user",
              displayName: speaker.name,
            },
    },
  };
  return { position, message, ...(withBrain ? { withBrain } : {}) };
}

const jo = { userId: "usr_jo", name: "Jo" };
const niels = { userId: "usr_niels", name: "Niels" };
// The brain's members, by account; Niels's account is named in full.
const members = [
  { id: "usr_jo", name: "Jo" },
  { id: "usr_niels", name: "Niels Ward" },
  { id: "usr_janhein", name: "Jan Hein" },
];

function extractorReturning(
  items: unknown[],
  revisions: { updates?: unknown[]; withdrawals?: unknown[] } = {},
): {
  extractor: ChannelActionItemExtractor;
  generate: ReturnType<typeof spyOn>;
} {
  const context = createMockEntityPluginContext();
  const generate = spyOn(context.ai, "generate").mockResolvedValue({
    items,
    updates: revisions.updates ?? [],
    withdrawals: revisions.withdrawals ?? [],
  });
  return {
    extractor: new ChannelActionItemExtractor(context, createSilentLogger()),
    generate,
  };
}

describe("ChannelActionItemExtractor", () => {
  const context = [said(10, jo, "The INC meeting went well.")];
  const fresh = [
    said(11, niels, "Someone needs to send INC the proposal."),
    said(12, jo, "I'll send it on Friday."),
    said(13, "guest", "Great, thanks!"),
  ];

  it("returns what the new messages commit to, with the message and owner", async () => {
    const { extractor } = extractorReturning([
      {
        title: "Send INC the proposal",
        text: "Jo sends INC the proposal on Friday.",
        message: 12,
        owner: "p1",
      },
    ]);

    const { items } = await extractor.extract({
      context,
      fresh,
      cards: [],
      members,
    });

    const joSaid = fresh[1];
    if (!joSaid) throw new Error("Missing fixture");
    expect(items).toEqual([
      {
        title: "Send INC the proposal",
        text: "Jo sends INC the proposal on Friday.",
        sourcePosition: 12,
        source: joSaid.message,
        owner: { name: "Jo", assignee: { name: "Jo", id: "user:usr_jo" } },
      },
    ]);
  });

  it("leaves an item no one takes on without an owner", async () => {
    const { extractor } = extractorReturning([
      {
        title: "Send INC the proposal",
        text: "Someone sends INC the proposal.",
        message: 11,
        owner: "nobody",
      },
    ]);

    const {
      items: [item],
    } = await extractor.extract({ context, fresh, cards: [], members });

    expect(item?.owner).toBeUndefined();
    expect(item?.sourcePosition).toBe(11);
  });

  it("drops items that cite an earlier message or one that does not exist", async () => {
    const { extractor } = extractorReturning([
      { title: "From context", text: "Old.", message: 10, owner: "nobody" },
      { title: "Made up", text: "None.", message: 40, owner: "nobody" },
    ]);

    expect(
      (await extractor.extract({ context, fresh, cards: [], members })).items,
    ).toEqual([]);
  });

  it("shows earlier messages as context only and numbers messages by position", async () => {
    const { extractor, generate } = extractorReturning([]);

    await extractor.extract({ context, fresh, cards: [], members });

    const prompt = String(generate.mock.calls[0]?.[0]?.prompt);
    expect(prompt).toContain("10. Jo (p1): The INC meeting went well.");
    expect(prompt).toContain(
      "11. Niels Ward (p2): Someone needs to send INC the proposal.",
    );
    expect(prompt).toContain("13. Natalie (p3): Great, thanks!");
    expect(prompt.indexOf("10. Jo")).toBeLessThan(
      prompt.indexOf("New messages"),
    );
  });

  it("gives a card to a member the messages name, though they did not speak", async () => {
    const { extractor, generate } = extractorReturning([
      {
        title: "Work on the Innovation Hub plan",
        text: "Jan Hein works on the Innovation Hub plan.",
        message: 11,
        owner: "Jan Hein",
      },
    ]);

    const { items } = await extractor.extract({
      context,
      fresh,
      cards: [],
      members,
    });

    expect(String(generate.mock.calls[0]?.[0]?.prompt)).toContain(
      "Members of the brain: Jo, Niels Ward, Jan Hein",
    );
    expect(items[0]?.owner).toEqual({
      name: "Jan Hein",
      assignee: { name: "Jan Hein", id: "user:usr_janhein" },
    });
  });

  it("names a speaker without an account as owner, without assigning the card", async () => {
    const { extractor } = extractorReturning([
      {
        title: "Book the venue",
        text: "Natalie books it.",
        message: 13,
        owner: "p3",
      },
    ]);

    const { items } = await extractor.extract({
      context,
      fresh,
      cards: [],
      members,
    });

    expect(items[0]?.owner).toEqual({ name: "Natalie" });
  });

  it("never cites a message from a conversation with the brain", async () => {
    const withBrain = [
      ...fresh,
      said(14, jo, "@brain add an action item: book the venue", true),
    ];
    const { extractor, generate } = extractorReturning([
      {
        title: "Book the venue",
        text: "Book it.",
        message: 14,
        owner: "nobody",
      },
    ]);

    const { items } = await extractor.extract({
      context,
      fresh: withBrain,
      cards: [],
      members,
    });

    expect(items).toEqual([]);
    expect(String(generate.mock.calls[0]?.[0]?.prompt)).toContain(
      "14. Jo (p1) [with the brain]: @brain add an action item: book the venue",
    );
  });

  it("adds a task the messages state twice only once", async () => {
    const { extractor } = extractorReturning([
      {
        title: "Work on the Innovation Hub plan",
        text: "A.",
        message: 11,
        owner: "nobody",
      },
      {
        title: "work on the innovation hub plan.",
        text: "B.",
        message: 12,
        owner: "nobody",
      },
    ]);

    const { items } = await extractor.extract({
      context,
      fresh,
      cards: [],
      members,
    });

    expect(items.map((item) => item.sourcePosition)).toEqual([11]);
  });

  it("does not add again a task the channel already has a card for", async () => {
    const { extractor } = extractorReturning([
      {
        title: "Send INC the proposal",
        text: "Again.",
        message: 12,
        owner: "p1",
      },
    ]);

    const { items } = await extractor.extract({
      context,
      fresh,
      cards: [
        {
          id: "discord-1466-message-3-1",
          title: "Send INC the proposal",
          text: "Jo sends INC the proposal on Friday.",
        },
      ],
      members,
    });

    expect(items).toEqual([]);
  });

  it("does not ask the model when there is nothing new", async () => {
    const { extractor, generate } = extractorReturning([]);

    expect(
      await extractor.extract({ context, fresh: [], cards: [], members }),
    ).toEqual({
      items: [],
      updates: [],
      withdrawals: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  describe("the channel's own cards", () => {
    function freshMessage(index: number): Message {
      const said = fresh[index]?.message;
      if (!said) throw new Error("Missing fixture");
      return said;
    }

    const cards = [
      {
        id: "discord-1466-message-3-1",
        title: "Send INC the proposal",
        text: "Jo sends INC the proposal on Friday.",
        owner: "Jo",
      },
    ];

    it("lists them for the model by a short reference", async () => {
      const { extractor, generate } = extractorReturning([]);

      await extractor.extract({ context, fresh, cards, members });

      expect(String(generate.mock.calls[0]?.[0]?.prompt)).toContain(
        "c1. Send INC the proposal: Jo sends INC the proposal on Friday. (owner: Jo)",
      );
    });

    it("returns a card the new messages change, with its new owner", async () => {
      const { extractor } = extractorReturning([], {
        updates: [
          {
            card: "c1",
            title: "Send INC the proposal",
            text: "Niels sends INC the proposal on Monday.",
            owner: "p2",
            message: 11,
          },
        ],
      });

      const { updates } = await extractor.extract({
        context,
        fresh,
        cards,
        members,
      });

      expect(updates).toEqual([
        {
          cardId: "discord-1466-message-3-1",
          title: "Send INC the proposal",
          text: "Niels sends INC the proposal on Monday.",
          owner: {
            name: "Niels Ward",
            assignee: { name: "Niels Ward", id: "user:usr_niels" },
          },
          sourcePosition: 11,
          source: freshMessage(0),
        },
      ]);
    });

    it("keeps a changed card's owner when the model says it is unchanged", async () => {
      const { extractor } = extractorReturning([], {
        updates: [
          {
            card: "c1",
            title: "Send INC the proposal",
            text: "Jo sends INC the proposal on Monday.",
            owner: "unchanged",
            message: 12,
          },
        ],
      });

      const { updates } = await extractor.extract({
        context,
        fresh,
        cards,
        members,
      });

      expect(updates[0]?.owner).toBe("unchanged");
    });

    it("returns a card the new messages withdraw", async () => {
      const { extractor } = extractorReturning([], {
        withdrawals: [{ card: "c1", message: 12 }],
      });

      const { withdrawals } = await extractor.extract({
        context,
        fresh,
        cards,
        members,
      });

      expect(withdrawals).toEqual([
        {
          cardId: "discord-1466-message-3-1",
          sourcePosition: 12,
          source: freshMessage(1),
        },
      ]);
    });

    it("never withdraws a card the same messages hand to someone else", async () => {
      const { extractor } = extractorReturning([], {
        updates: [
          {
            card: "c1",
            title: "Send INC the proposal",
            text: "Niels sends INC the proposal on Monday.",
            owner: "p2",
            message: 11,
          },
        ],
        withdrawals: [{ card: "c1", message: 12 }],
      });

      const { updates, withdrawals } = await extractor.extract({
        context,
        fresh,
        cards,
        members,
      });

      expect(updates.map((update) => update.cardId)).toEqual([
        "discord-1466-message-3-1",
      ]);
      expect(withdrawals).toEqual([]);
    });

    it("drops changes to cards it was not shown or that cite no new message", async () => {
      const { extractor } = extractorReturning([], {
        updates: [
          {
            card: "c9",
            title: "Unknown",
            text: "Unknown.",
            owner: "nobody",
            message: 12,
          },
        ],
        withdrawals: [{ card: "c1", message: 10 }],
      });

      expect(
        await extractor.extract({ context, fresh, cards, members }),
      ).toEqual({
        items: [],
        updates: [],
        withdrawals: [],
      });
    });
  });
});
