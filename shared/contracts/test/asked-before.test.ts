import { describe, expect, it } from "bun:test";
import {
  askedBeforeRequestSchema,
  askedBeforeResponseSchema,
  firstAskedBeforeHit,
} from "../src/asked-before";
import { chatHistoryMessageSchema, chatProtocolEventSchema } from "../src/chat";

// A visitor's question is put to the FAQs before the model; a hit carries the
// FAQ's answer and the sources it kept, and a malformed answer is no answer.
describe("a question asked before", () => {
  const hit = {
    faqId: "how-does-rizom-keep-memory",
    answer: "In the brains of the people who hold it.",
    sources: [
      {
        id: "post:handoffs",
        source: "post",
        title: "Handoffs between teams",
        url: "https://becca.rizom.ai/essays/handoffs",
        brain: { name: "Becca", url: "https://becca.rizom.ai" },
      },
    ],
  };

  it("asks with the question alone", () => {
    expect(askedBeforeRequestSchema.parse({ question: " Why? " })).toEqual({
      question: "Why?",
    });
    expect(() => askedBeforeRequestSchema.parse({ question: " " })).toThrow();
  });

  it("answers with a hit or with nothing", () => {
    expect(askedBeforeResponseSchema.parse({ hit })).toEqual({ hit });
    expect(askedBeforeResponseSchema.parse({})).toEqual({});
    expect(
      askedBeforeResponseSchema.parse({
        hit: { faqId: "x", answer: "An answer." },
      }).hit?.sources,
    ).toEqual([]);
  });

  it("reaches the box as its own event, naming the FAQ", () => {
    expect(
      chatProtocolEventSchema.parse({
        type: "data-asked-before",
        id: "asked-before",
        data: { faqId: "how-does-rizom-keep-memory" },
      }),
    ).toMatchObject({ data: { faqId: "how-does-rizom-keep-memory" } });
    expect(() =>
      chatProtocolEventSchema.parse({ type: "data-asked-before", data: {} }),
    ).toThrow();
  });

  it("stays on the reply in the conversation's history", () => {
    expect(
      chatHistoryMessageSchema.parse({
        id: "a",
        role: "assistant",
        content: "In the brains of the people who hold it.",
        askedBefore: { faqId: "how-does-rizom-keep-memory" },
      }).askedBefore,
    ).toEqual({ faqId: "how-does-rizom-keep-memory" });
  });

  it("takes the first well-formed hit and ignores the rest", () => {
    expect(
      firstAskedBeforeHit([
        { noop: true },
        { success: true, data: {} },
        { hit: { faqId: "", answer: "" } },
        { hit },
        { hit: { ...hit, faqId: "second" } },
      ]),
    ).toEqual(hit);
    expect(firstAskedBeforeHit([{}, "garbage", null])).toBeUndefined();
  });
});
