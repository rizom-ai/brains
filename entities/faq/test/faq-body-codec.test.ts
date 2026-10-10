import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { z } from "@brains/sdk/entities";
import {
  createFaqContent,
  faqBodyCodec,
  parseFaqContent,
} from "../src/lib/faq-content";
import type { FaqBody } from "../src/schemas/faq";

const formatter = {
  format: (body: FaqBody): string => z.encode(faqBodyCodec, body),
  parse: (markdown: string): FaqBody => z.decode(faqBodyCodec, markdown),
};

describe("declarative FAQ body codec", () => {
  it("round-trips canonical answers and alternatives", () => {
    for (const alternatives of [
      [],
      [
        { answer: "Ask the brain." },
        { answer: "#### From the CLI\n\nRun the publish command." },
      ],
    ]) {
      expectBodyRoundTrip(formatter, {
        answer: "Open it in Studio.",
        alternatives,
      });
    }
  });

  it("validates untyped writes instead of persisting malformed alternatives", () => {
    const untyped: z.ZodType<unknown, string> = faqBodyCodec;
    expect(() =>
      z.encode(untyped, {
        answer: "Open it.",
        alternatives: [{ text: "Ask." }],
      }),
    ).toThrow(z.ZodError);
  });

  it("routes production content helpers through the codec without changing provenance", () => {
    const frontmatter = {
      question: "How?",
      status: "published" as const,
      asked: 7,
      sources: [
        { id: "post:one", title: "Source", url: "https://example.com/one" },
      ],
    };
    const content = createFaqContent(frontmatter, "Open it.", [
      { answer: "Ask." },
    ]);
    const parsed = parseFaqContent(content);
    expect(parsed.answer).toBe("Open it.");
    expect(parsed.alternatives).toEqual([{ answer: "Ask." }]);
    expect(parsed.frontmatter.asked).toBe(7);
    expect(parsed.frontmatter.sources).toEqual(frontmatter.sources);
    expect(() =>
      Reflect.apply(createFaqContent, undefined, [
        frontmatter,
        "Open it.",
        [{ text: "Wrong shape" }],
      ]),
    ).toThrow(z.ZodError);
  });
});
