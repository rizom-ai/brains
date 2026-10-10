import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { faqAdapter } from "../src";
import { faqBodyCodec } from "../src/adapters/faq-adapter";
import type { FaqBody } from "../src/schemas/faq";

const frontmatter = {
  question: "How do I publish a draft?",
  status: "draft" as const,
  asked: 2,
};

describe("FaqAdapter", () => {
  it("keeps only what a reader needs in frontmatter, the answer as body", () => {
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose Publish.",
    );

    expect(markdown.split("---")[1]?.trim()).toBe(
      ["question: How do I publish a draft?", "status: draft", "asked: 2"].join(
        "\n",
      ),
    );
    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.frontmatter).toEqual(frontmatter);
    expect(parsed.answer).toBe("Open it in Studio and choose Publish.");
    expect(parsed.alternatives).toEqual([]);
    expect(faqAdapter.fromMarkdown(markdown)).toMatchObject({
      entityType: "faq",
      metadata: frontmatter,
    });
  });

  it("keeps the owner's rank in frontmatter and metadata", () => {
    const ranked = { ...frontmatter, rank: 2 };
    const markdown = faqAdapter.createFaqContent(ranked, "Choose Publish.");

    expect(markdown).toContain("rank: 2");
    expect(faqAdapter.parseFaqContent(markdown).frontmatter).toEqual(ranked);
    expect(faqAdapter.fromMarkdown(markdown).metadata).toEqual(ranked);
  });

  it("numbers alternative answers as markdown sections below the answer", () => {
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose **Publish**.",
      [
        { answer: "Set the status to published.\n\nThen save." },
        { answer: "Use the Publish button." },
      ],
    );

    expect(markdown).toContain(
      [
        "Open it in Studio and choose **Publish**.",
        "",
        "## Alternative answers",
        "",
        "### Alternative 1",
        "",
        "Set the status to published.",
        "",
        "Then save.",
        "",
        "### Alternative 2",
        "",
        "Use the Publish button.",
      ].join("\n"),
    );

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.answer).toBe("Open it in Studio and choose **Publish**.");
    expect(parsed.alternatives).toEqual([
      { answer: "Set the status to published.\n\nThen save." },
      { answer: "Use the Publish button." },
    ]);
  });

  it("reads alternatives the owner edited, whatever their headings say", () => {
    const markdown = [
      "---",
      "question: What is a brain?",
      "status: draft",
      "---",
      "A personal knowledge service.",
      "",
      "## Alternative answers",
      "",
      "### Shorter",
      "",
      "Your notes, served.",
      "",
      "### Alternative 7",
      "",
      "A place your knowledge lives.",
      "",
    ].join("\n");

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.frontmatter.asked).toBe(1);
    expect(parsed.answer).toBe("A personal knowledge service.");
    expect(parsed.alternatives).toEqual([
      { answer: "Your notes, served." },
      { answer: "A place your knowledge lives." },
    ]);
  });

  it("keeps an alternative's own headings inside that alternative", () => {
    const markdown = faqAdapter.createFaqContent(frontmatter, "Publish it.", [
      {
        answer:
          "Two steps.\n\n### Step 1\n\nOpen Studio.\n\n## Step 2\n\nPublish.",
      },
      { answer: "Choose Publish." },
    ]);

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.alternatives).toHaveLength(2);
    expect(parsed.alternatives[0]?.answer).toContain("Step 1");
    expect(parsed.alternatives[0]?.answer).toContain("Publish.");
    expect(parsed.alternatives[1]).toEqual({ answer: "Choose Publish." });
  });

  it("leaves heading-like lines in code blocks alone", () => {
    const code = "```sh\n# install\n### not a heading\nbun add brain\n```";
    const markdown = faqAdapter.createFaqContent(frontmatter, "Install it.", [
      { answer: `Run:\n\n${code}` },
    ]);

    expect(faqAdapter.parseFaqContent(markdown).alternatives).toEqual([
      { answer: `Run:\n\n${code}` },
    ]);
  });
});

describe("faqBodyCodec", () => {
  const formatter = {
    format: (body: FaqBody): string => z.encode(faqBodyCodec, body),
    parse: (markdown: string): FaqBody => z.decode(faqBodyCodec, markdown),
  };

  it("round-trips an answer and its alternatives", () => {
    expectBodyRoundTrip(formatter, {
      answer: "Open it in Studio and choose Publish.",
      alternatives: [
        { answer: "Ask the brain to publish it." },
        { answer: "#### From the CLI\n\nRun the publish command." },
      ],
    });
  });

  it("round-trips an answer with no alternatives", () => {
    expectBodyRoundTrip(formatter, {
      answer: "Open it in Studio and choose Publish.",
      alternatives: [],
    });
  });

  it("rejects a body that violates the schema when writing", () => {
    const untyped: z.ZodType<unknown, string> = faqBodyCodec;

    expect(() =>
      z.encode(untyped, {
        answer: "Open it in Studio.",
        alternatives: [{ text: "Ask the brain." }],
      }),
    ).toThrow(z.ZodError);
  });
});
