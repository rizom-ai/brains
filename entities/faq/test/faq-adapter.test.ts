import { describe, expect, it } from "bun:test";
import { faqAdapter } from "../src";

const frontmatter = {
  question: "How do I publish a draft?",
  status: "draft" as const,
  sourceConversationId: "conv-1",
  sourceMessageId: "msg-2",
  mergedMessageIds: ["msg-9"],
};

describe("FaqAdapter", () => {
  it("round-trips the question in frontmatter and the answer as body", () => {
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose Publish.",
    );

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.frontmatter).toEqual(frontmatter);
    expect(parsed.answer).toBe("Open it in Studio and choose Publish.");
    expect(parsed.alternatives).toEqual([]);
    expect(markdown).not.toContain("Alternative answers");

    expect(faqAdapter.fromMarkdown(markdown)).toMatchObject({
      entityType: "faq",
      metadata: {
        question: "How do I publish a draft?",
        status: "draft",
        asked: 2,
      },
    });
  });

  it("keeps alternative answers as markdown in the body, apart from the answer", () => {
    const markdown = faqAdapter.createFaqContent(
      frontmatter,
      "Open it in Studio and choose **Publish**.",
      [
        {
          messageId: "msg-9",
          answer: "Set the status to published.\n\nThen save.",
        },
      ],
    );

    expect(markdown).toContain(
      [
        "Open it in Studio and choose **Publish**.",
        "",
        "## Alternative answers",
        "",
        "### From reply msg-9",
        "",
        "Set the status to published.",
        "",
        "Then save.",
      ].join("\n"),
    );
    expect(markdown.split("---")[1]).not.toContain("Set the status");

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.answer).toBe("Open it in Studio and choose **Publish**.");
    expect(parsed.alternatives).toEqual([
      {
        messageId: "msg-9",
        answer: "Set the status to published.\n\nThen save.",
      },
    ]);
  });

  it("reads alternatives the owner edited in the editor", () => {
    const markdown = [
      "---",
      "question: What is a brain?",
      "status: draft",
      "sourceConversationId: conv-1",
      "sourceMessageId: msg-2",
      "---",
      "A personal knowledge service.",
      "",
      "## Alternative answers",
      "",
      "### From reply msg-3",
      "",
      "A place your knowledge lives.",
      "",
      "### From reply msg-4",
      "",
      "Your notes, served.",
      "",
    ].join("\n");

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.frontmatter.mergedMessageIds).toEqual([]);
    expect(parsed.answer).toBe("A personal knowledge service.");
    expect(parsed.alternatives).toEqual([
      { messageId: "msg-3", answer: "A place your knowledge lives." },
      { messageId: "msg-4", answer: "Your notes, served." },
    ]);
    expect(faqAdapter.fromMarkdown(markdown).metadata?.asked).toBe(1);
  });
});
