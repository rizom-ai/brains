import { describe, expect, it, spyOn } from "bun:test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import type { Message } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { ChannelDecisionExtractor } from "../../../src/lib/channel-pickup/decision-extractor";
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
  extractor: ChannelDecisionExtractor;
  generate: ReturnType<typeof spyOn>;
} {
  const context = createMockEntityPluginContext();
  const generate = spyOn(context.ai, "generate").mockResolvedValue({
    language: "English",
    candidates,
  });
  return {
    extractor: new ChannelDecisionExtractor(context, createSilentLogger()),
    generate,
  };
}

describe("ChannelDecisionExtractor", () => {
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
  };

  it("returns what the new messages settle, with the message and who decided", async () => {
    const { extractor } = extractorReturning([dropTheField]);

    const { decisions } = await extractor.extract({
      context,
      fresh,
      decisions: [],
    });

    expect(decisions).toEqual([
      {
        title: "Drop the company field",
        text: "The sign-up form no longer asks for a company name.",
        sourcePosition: 12,
        source: acceptance.message,
        decidedBy: [
          {
            identity: { kind: "user", userId: "usr_jo" },
            displayName: "Jo",
          },
          {
            identity: { kind: "user", userId: "usr_niels" },
            displayName: "Niels",
          },
        ],
      },
    ]);
  });

  it("shows the model the messages, their speakers and the channel's decisions", async () => {
    const { extractor, generate } = extractorReturning([]);

    await extractor.extract({
      context,
      fresh,
      decisions: [
        {
          id: "d-earlier",
          title: "Keep the newsletter weekly",
          text: "The newsletter stays weekly.",
        },
      ],
    });

    const [request] = generate.mock.calls[0] ?? [];
    const prompt: string = request.prompt;
    expect(prompt).toContain("10. Jo (p1): Sign-ups dropped again last week.");
    expect(prompt).toContain("12. Jo (p1): Yes, let's drop it.");
    expect(prompt).toContain("11. Niels (p2):");
    expect(prompt).toContain(
      "d1. Keep the newsletter weekly: The newsletter stays weekly.",
    );
    expect(request.templateName).toBe("conversation-memory:channel-decisions");
  });

  it("drops a decision that cites no new message", async () => {
    const { extractor } = extractorReturning([
      { ...dropTheField, message: 10 },
      { ...dropTheField, title: "Somewhere else", message: 99 },
    ]);

    const { decisions } = await extractor.extract({
      context,
      fresh,
      decisions: [],
    });

    expect(decisions).toEqual([]);
  });

  it("never picks a decision up from a conversation with the brain", async () => {
    const { extractor, generate } = extractorReturning([dropTheField]);

    const { decisions } = await extractor.extract({
      context,
      fresh: [proposal, said(12, jo, "Yes, let's drop it.", true)],
      decisions: [],
    });

    expect(decisions).toEqual([]);
    const [request] = generate.mock.calls[0] ?? [];
    expect(request.prompt).toContain("[with the brain]");
  });

  it("returns a decision once, and never one the channel already has", async () => {
    const { extractor } = extractorReturning([
      dropTheField,
      { ...dropTheField, title: "Drop the company field!", message: 13 },
      {
        kind: "decision",
        title: "keep the newsletter weekly",
        text: "It stays weekly.",
        message: 13,
        decidedBy: [],
      },
    ]);

    const { decisions } = await extractor.extract({
      context,
      fresh,
      decisions: [
        {
          id: "d-earlier",
          title: "Keep the newsletter weekly",
          text: "The newsletter stays weekly.",
        },
      ],
    });

    expect(decisions.map((decision) => decision.sourcePosition)).toEqual([12]);
  });

  it("keeps only what the model judges a decision", async () => {
    const { extractor } = extractorReturning([
      { ...dropTheField, kind: "undecided", title: "Switch mail provider" },
      { ...dropTheField, kind: "action-item", title: "Fix the form" },
      { ...dropTheField, kind: "recorded", title: "Keep it weekly" },
      dropTheField,
    ]);

    const { decisions } = await extractor.extract({
      context,
      fresh,
      decisions: [],
    });

    expect(decisions.map((decision) => decision.title)).toEqual([
      "Drop the company field",
    ]);
  });

  it("names the recorded decision a new one replaces", async () => {
    const recorded = [
      {
        id: "d-earlier",
        title: "Drop the company field",
        text: "The form no longer asks for a company name.",
      },
    ];
    const keepIt = {
      ...dropTheField,
      title: "Keep the company field",
      text: "Invoicing needs the company name, so the field stays.",
    };
    const { extractor } = extractorReturning([
      { ...keepIt, replaces: "d1" },
      { ...keepIt, title: "Send invoices monthly", replaces: "d7" },
      { ...keepIt, title: "Keep the email field", replaces: "none" },
    ]);

    const { decisions } = await extractor.extract({
      context,
      fresh,
      decisions: recorded,
    });

    expect(decisions.map((decision) => decision.replaces)).toEqual([
      "d-earlier",
      undefined,
      undefined,
    ]);
  });

  it("names only deciders it can identify", async () => {
    const { extractor } = extractorReturning([
      { ...dropTheField, message: 21, decidedBy: ["p1", "p9", "nobody"] },
    ]);

    const { decisions } = await extractor.extract({
      context: [],
      fresh: [said(21, "unknown", "We are dropping the company field.")],
      decisions: [],
    });

    expect(decisions.map((decision) => decision.decidedBy)).toEqual([[]]);
  });

  it("asks the model nothing when there are no new messages", async () => {
    const { extractor, generate } = extractorReturning([dropTheField]);

    const { decisions } = await extractor.extract({
      context,
      fresh: [],
      decisions: [],
    });

    expect(decisions).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
