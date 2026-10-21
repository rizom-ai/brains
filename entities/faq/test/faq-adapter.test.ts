import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { faqAdapter } from "../src";
import { faqBodyCodec } from "../src/adapters/faq-adapter";
import type { FaqBody, FaqEntity } from "../src/schemas/faq";

const frontmatter = {
  question: "How do I publish a draft?",
  status: "draft" as const,
  asked: 2,
};

const sources = [
  {
    id: "post:handoffs",
    title: "Handoffs between [teams]",
    url: "https://becca.rizom.ai/essays/handoffs",
    excerpt: "Before anyone leaves a task we write three things down.",
    brain: { name: "Becca", url: "https://becca.rizom.ai/" },
  },
  { id: "post:publishing", title: "Publishing from Studio" },
];

function stored(content: string): FaqEntity {
  return {
    id: "how-do-i-publish-a-draft",
    entityType: "faq",
    content,
    contentHash: "hash",
    visibility: "public",
    created: "2026-10-21T00:00:00.000Z",
    updated: "2026-10-21T00:00:00.000Z",
    metadata: {
      question: "How do I publish a draft?",
      status: "draft",
      asked: 2,
    },
  };
}

describe("FaqAdapter", () => {
  it("keeps only what a reader needs in frontmatter, and the answer under its heading", () => {
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose Publish.",
    );

    expect(markdown.split("---")[1]?.trim()).toBe(
      ["question: How do I publish a draft?", "status: draft", "asked: 2"].join(
        "\n",
      ),
    );
    expect(markdown).toContain(
      "## Answer\nOpen it in Studio and choose Publish.",
    );
    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.frontmatter).toEqual(frontmatter);
    expect(parsed.answer).toBe("Open it in Studio and choose Publish.");
    expect(parsed.sources).toEqual([]);
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

  it("keeps alternative answers as sections below the answer", () => {
    const alternatives = [
      { answer: "Set the status to published.\n\nThen save." },
      { answer: "Use the **Publish** button." },
    ];
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose **Publish**.",
      alternatives,
    );

    expect(markdown).toContain("## Alternative answers");
    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.answer).toBe("Open it in Studio and choose **Publish**.");
    expect(parsed.alternatives).toEqual(alternatives);
  });

  it("keeps an alternative's own headings and code inside that alternative", () => {
    const code = "```sh\n# install\n### not a heading\nbun add brain\n```";
    const alternatives = [
      {
        answer:
          "Two steps.\n\n### Step 1\n\nOpen Studio.\n\n## Step 2\n\nPublish.",
      },
      { answer: `Run:\n\n${code}` },
    ];
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Publish it.",
      alternatives,
    );

    expect(faqAdapter.parseFaqContent(markdown).alternatives).toEqual(
      alternatives,
    );
  });
});

describe("FAQ sources", () => {
  it("are a list of links under the answer, each quoting what it drew on", () => {
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose Publish.",
      [],
      sources,
    );

    expect(markdown).not.toMatch(/^sources:/m);
    expect(markdown).toContain(
      [
        "## Sources",
        "",
        '- [Handoffs between \\[teams\\]](https://becca.rizom.ai/essays/handoffs "post:handoffs") — from [Becca](https://becca.rizom.ai/)',
        "  > Before anyone leaves a task we write three things down.",
        "- [Publishing from Studio](post:publishing)",
      ].join("\n"),
    );
    expect(faqAdapter.parseFaqContent(markdown).sources).toEqual(sources);
  });

  it("keep references with spaces and excerpts over several lines", () => {
    const awkward = [
      {
        id: "note:Executive Team Meeting 2026-10-06",
        title: "Executive Team Meeting 2026-10-06",
        excerpt:
          "--- title: Knowledge Networks ---\n# Executive Team Meeting\n\nTopics discussed.",
        brain: { name: "Rizom Core Team", url: "https://team.rizom.ai/" },
      },
    ];
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Answer.",
      [],
      awkward,
    );

    expect(markdown).toContain(
      "- [Executive Team Meeting 2026-10-06](<note:Executive Team Meeting 2026-10-06>)",
    );
    expect(faqAdapter.parseFaqContent(markdown).sources).toEqual(awkward);
  });

  it("reject a line in the Sources section that is not a source", () => {
    const markdown = faqAdapter
      .createFaqContent(frontmatter, "Answer.", [], sources)
      .replace("- [Publishing from Studio](post:publishing)", "just some text");

    expect(() => faqAdapter.parseFaqContent(markdown)).toThrow();
  });
});

describe("FAQs stored before the formatter", () => {
  const legacyBody = [
    "---",
    "question: How do I publish a draft?",
    "status: draft",
    "asked: 2",
    "sources:",
    "  - id: post:publishing",
    "    title: Publishing from Studio",
    "    excerpt: Choose Publish in the editor.",
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

  it("read the answer, renamed alternatives and frontmatter sources", () => {
    const parsed = faqAdapter.parseFaqContent(legacyBody);
    expect(parsed.answer).toBe("A personal knowledge service.");
    expect(parsed.alternatives).toEqual([
      { answer: "Your notes, served." },
      { answer: "A place your knowledge lives." },
    ]);
    expect(parsed.sources).toEqual([
      {
        id: "post:publishing",
        title: "Publishing from Studio",
        excerpt: "Choose Publish in the editor.",
      },
    ]);
  });

  it("are written in the formatter's layout on their next write, sources in the body", () => {
    const written = faqAdapter.toMarkdown(stored(legacyBody));
    const body = written.split("---").slice(2).join("---");

    expect(body).toContain("## Answer\nA personal knowledge service.");
    expect(body).toContain(
      "- [Publishing from Studio](post:publishing)\n  > Choose Publish in the editor.",
    );
    expect(faqAdapter.parseFaqContent(written)).toMatchObject({
      answer: "A personal knowledge service.",
      alternatives: [
        { answer: "Your notes, served." },
        { answer: "A place your knowledge lives." },
      ],
    });
  });

  it("leave a body already in the formatter's layout as written", () => {
    const current = faqAdapter.createFaqContent(
      frontmatter,
      "Answer.",
      [],
      sources,
    );
    expect(
      faqAdapter.toMarkdown(stored(current)).split("---").slice(2).join("---"),
    ).toBe(current.split("---").slice(2).join("---"));
  });
});

describe("faqBodyCodec", () => {
  const formatter = {
    format: (body: FaqBody): string => z.encode(faqBodyCodec, body),
    parse: (markdown: string): FaqBody => z.decode(faqBodyCodec, markdown),
  };

  it("round-trips an answer, its sources and its alternatives", () => {
    expectBodyRoundTrip(formatter, {
      answer: "Open it in Studio and choose Publish.",
      sources,
      alternatives: [
        { answer: "Ask the brain to publish it." },
        { answer: "#### From the CLI\n\nRun the publish command." },
      ],
    });
  });

  it("round-trips an answer alone", () => {
    expectBodyRoundTrip(formatter, {
      answer: "Open it in Studio and choose Publish.",
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
