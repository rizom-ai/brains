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
  return { position, message };
}

const jo = { userId: "usr_jo", name: "Jo" };
const niels = { userId: "usr_niels", name: "Niels" };

function extractorReturning(items: unknown[]): {
  extractor: ChannelActionItemExtractor;
  generate: ReturnType<typeof spyOn>;
} {
  const context = createMockEntityPluginContext();
  const generate = spyOn(context.ai, "generate").mockResolvedValue({ items });
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

    const items = await extractor.extract({ context, fresh });

    const joSaid = fresh[1];
    if (!joSaid) throw new Error("Missing fixture");
    expect(items).toEqual([
      {
        title: "Send INC the proposal",
        text: "Jo sends INC the proposal on Friday.",
        sourcePosition: 12,
        source: joSaid.message,
        owner: {
          identity: { kind: "user", userId: "usr_jo" },
          interfaceType: "discord",
          role: "user",
          displayName: "Jo",
        },
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

    const [item] = await extractor.extract({ context, fresh });

    expect(item?.owner).toBeUndefined();
    expect(item?.sourcePosition).toBe(11);
  });

  it("drops items that cite an earlier message or one that does not exist", async () => {
    const { extractor } = extractorReturning([
      { title: "From context", text: "Old.", message: 10, owner: "nobody" },
      { title: "Made up", text: "None.", message: 40, owner: "nobody" },
    ]);

    expect(await extractor.extract({ context, fresh })).toEqual([]);
  });

  it("shows earlier messages as context only and numbers messages by position", async () => {
    const { extractor, generate } = extractorReturning([]);

    await extractor.extract({ context, fresh });

    const prompt = String(generate.mock.calls[0]?.[0]?.prompt);
    expect(prompt).toContain("10. Jo (p1): The INC meeting went well.");
    expect(prompt).toContain(
      "11. Niels (p2): Someone needs to send INC the proposal.",
    );
    expect(prompt).toContain("13. Natalie (p3): Great, thanks!");
    expect(prompt.indexOf("10. Jo")).toBeLessThan(
      prompt.indexOf("New messages"),
    );
  });

  it("does not ask the model when there is nothing new", async () => {
    const { extractor, generate } = extractorReturning([]);

    expect(await extractor.extract({ context, fresh: [] })).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
