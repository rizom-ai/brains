import { describe, expect, it, spyOn } from "bun:test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import type { Message } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import {
  ChannelClaimExtractor,
  type ChannelClaimExtractionInput,
  type RecordedClaim,
} from "../../../src/lib/channel-pickup/claim-extractor";
import type { PositionedMessage } from "../../../src/lib/channel-pickup/messages";

function said(
  position: number,
  speaker: { userId: string; name: string } | "unknown",
  content: string,
  withBrain = false,
): PositionedMessage {
  const message: Message = {
    id: `m${position}`,
    conversationId: "discord:1466",
    role: "user",
    content,
    timestamp: `2026-10-23T09:0${position % 10}:00.000Z`,
    metadata:
      speaker === "unknown"
        ? {}
        : {
            actor: {
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

function extractorReturning(candidates: unknown[]): {
  extractor: ChannelClaimExtractor;
  generate: ReturnType<typeof spyOn>;
} {
  const context = createMockEntityPluginContext();
  const generate = spyOn(context.ai, "generate").mockResolvedValue({
    language: "English",
    candidates,
  });
  return {
    extractor: new ChannelClaimExtractor(context, createSilentLogger()),
    generate,
  };
}

describe("ChannelClaimExtractor", () => {
  const context = [said(10, jo, "Sign-ups dropped again last week.")];
  const proposal = said(
    11,
    niels,
    "Shall we drop the company field from the form?",
  );
  const acceptance = said(12, jo, "Yes, let's drop it.");
  const fresh = [proposal, acceptance, said(13, niels, "Great.")];
  const dropTheField = {
    kind: "decision",
    title: "Drop the company field",
    text: "The sign-up form no longer asks for a company name.",
    message: 12,
    decidedBy: ["p1", "p2"],
    replaces: "none",
  };
  const newsletterWeekly: RecordedClaim = {
    id: "d-earlier",
    kind: "decision",
    title: "Keep the newsletter weekly",
    text: "The newsletter stays weekly.",
  };

  /** The channel's messages, with what it has recorded and whether insights are picked up. */
  function channel(
    overrides: Partial<ChannelClaimExtractionInput> = {},
  ): ChannelClaimExtractionInput {
    return { context, fresh, recorded: [], insights: false, ...overrides };
  }

  it("returns what the new messages settle, with the message and who decided", async () => {
    const { extractor } = extractorReturning([dropTheField]);

    const { claims } = await extractor.extract(channel());

    expect(claims).toEqual([
      {
        kind: "decision",
        title: "Drop the company field",
        text: "The sign-up form no longer asks for a company name.",
        sourcePosition: 12,
        source: acceptance.message,
        by: [
          {
            identity: { kind: "user", userId: "usr_jo" },
            displayName: "Jo",
          },
          {
            identity: { kind: "user", userId: "usr_niels" },
            displayName: "Niels",
          },
        ],
        replaces: undefined,
      },
    ]);
  });

  it("shows the model the messages, their speakers and what the channel has recorded", async () => {
    const { extractor, generate } = extractorReturning([]);

    await extractor.extract(
      channel({
        recorded: [
          newsletterWeekly,
          {
            id: "i-earlier",
            kind: "insight",
            title: "Freelancers have no company name",
            text: "They leave the form at that field.",
          },
        ],
      }),
    );

    const [request] = generate.mock.calls[0] ?? [];
    const prompt: string = request.prompt;
    expect(prompt).toContain("10. Jo (p1): Sign-ups dropped again last week.");
    expect(prompt).toContain("12. Jo (p1): Yes, let's drop it.");
    expect(prompt).toContain("11. Niels (p2):");
    expect(prompt).toContain(
      "d1. Keep the newsletter weekly: The newsletter stays weekly.",
    );
    expect(prompt).toContain(
      "d2. [insight] Freelancers have no company name: They leave the form at that field.",
    );
    expect(request.templateName).toBe("conversation-memory:channel-decisions");
  });

  it("drops a decision that cites no new message", async () => {
    const { extractor } = extractorReturning([
      { ...dropTheField, message: 10 },
      { ...dropTheField, title: "Somewhere else", message: 99 },
    ]);

    const { claims } = await extractor.extract(channel());

    expect(claims).toEqual([]);
  });

  it("never picks a decision up from a conversation with the brain", async () => {
    const { extractor, generate } = extractorReturning([dropTheField]);

    const { claims } = await extractor.extract(
      channel({
        fresh: [proposal, said(12, jo, "Yes, let's drop it.", true)],
      }),
    );

    expect(claims).toEqual([]);
    const [request] = generate.mock.calls[0] ?? [];
    expect(request.prompt).toContain("[with the brain]");
  });

  it("returns a decision once, and never one the channel already has", async () => {
    const { extractor } = extractorReturning([
      dropTheField,
      { ...dropTheField, title: "Drop the company field!", message: 13 },
      {
        ...dropTheField,
        title: "keep the newsletter weekly",
        text: "It stays weekly.",
        message: 13,
        decidedBy: [],
      },
    ]);

    const { claims } = await extractor.extract(
      channel({ recorded: [newsletterWeekly] }),
    );

    expect(claims.map((claim) => claim.sourcePosition)).toEqual([12]);
  });

  it("keeps only what the model judges a decision", async () => {
    const { extractor } = extractorReturning([
      { ...dropTheField, kind: "undecided", title: "Switch mail provider" },
      { ...dropTheField, kind: "action-item", title: "Fix the form" },
      { ...dropTheField, kind: "recorded", title: "Keep it weekly" },
      dropTheField,
    ]);

    const { claims } = await extractor.extract(channel());

    expect(claims.map((claim) => claim.title)).toEqual([
      "Drop the company field",
    ]);
  });

  it("names the recorded claim a new one replaces, a decision or an insight", async () => {
    const recorded: RecordedClaim[] = [
      {
        id: "d-earlier",
        kind: "decision",
        title: "Drop the company field",
        text: "The form no longer asks for a company name.",
      },
      {
        id: "i-earlier",
        kind: "insight",
        title: "The mail server drops sign-ups",
        text: "Confirmation mails bounce.",
      },
    ];
    const keepIt = {
      ...dropTheField,
      title: "Keep the company field",
      text: "Invoicing needs the company name, so the field stays.",
    };
    const { extractor } = extractorReturning([
      { ...keepIt, replaces: "d1" },
      { ...keepIt, title: "Move to a new mail server", replaces: "d2" },
      { ...keepIt, title: "Send invoices monthly", replaces: "d7" },
      { ...keepIt, title: "Keep the email field", replaces: "none" },
    ]);

    const { claims } = await extractor.extract(channel({ recorded }));

    expect(claims.map((claim) => claim.replaces)).toEqual([
      { id: "d-earlier", kind: "decision" },
      { id: "i-earlier", kind: "insight" },
      undefined,
      undefined,
    ]);
  });

  it("names only deciders it can identify", async () => {
    const { extractor } = extractorReturning([
      { ...dropTheField, message: 21, decidedBy: ["p1", "p9", "nobody"] },
    ]);

    const { claims } = await extractor.extract(
      channel({
        context: [],
        fresh: [said(21, "unknown", "We are dropping the company field.")],
      }),
    );

    expect(claims.map((claim) => claim.by)).toEqual([[]]);
  });

  it("asks the model nothing when there are no new messages", async () => {
    const { extractor, generate } = extractorReturning([dropTheField]);

    const { claims } = await extractor.extract(channel({ fresh: [] }));

    expect(claims).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  describe("insights", () => {
    const whyTheyLeave = {
      kind: "insight",
      title: "Freelancers leave at the company field",
      text: "They have no company name to give, so they abandon the form there.",
      message: 12,
      decidedBy: ["p1"],
      replaces: "none",
    };

    it("are returned beside decisions, by who stated them, when insights are picked up", async () => {
      const { extractor } = extractorReturning([dropTheField, whyTheyLeave]);

      const { claims } = await extractor.extract(channel({ insights: true }));

      expect(
        claims.map(({ kind, title, by }) => ({ kind, title, by })),
      ).toEqual([
        expect.objectContaining({ kind: "decision" }),
        {
          kind: "insight",
          title: "Freelancers leave at the company field",
          by: [
            {
              identity: { kind: "user", userId: "usr_jo" },
              displayName: "Jo",
            },
          ],
        },
      ]);
    });

    it("are dropped when insights are not picked up, and the model is not asked for them", async () => {
      const { extractor, generate } = extractorReturning([whyTheyLeave]);

      const { claims } = await extractor.extract(channel({ insights: false }));

      expect(claims).toEqual([]);
      const [request] = generate.mock.calls[0] ?? [];
      expect(request.prompt).not.toContain("insight");
    });

    it("are asked for, and told apart from decisions, when insights are picked up", async () => {
      const { extractor, generate } = extractorReturning([]);

      await extractor.extract(channel({ insights: true }));

      const [request] = generate.mock.calls[0] ?? [];
      const prompt: string = request.prompt;
      expect(prompt).toContain("Find the decisions and insights");
      expect(prompt).toContain('- "insight":');
      expect(prompt).toContain('never an "insight"');
    });
  });
});
