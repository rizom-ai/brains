import { describe, expect, it } from "bun:test";
import { faqAdapter } from "../src";

describe("FaqAdapter", () => {
  it("round-trips the question in frontmatter and the answer as body", () => {
    const markdown = faqAdapter.createFaqContent(
      {
        question: "How do I publish a draft?",
        status: "draft",
        sourceConversationId: "conv-1",
        sourceMessageId: "msg-2",
        mergedMessageIds: ["msg-9"],
      },
      "Open it in Studio and choose Publish.",
    );

    const parsed = faqAdapter.parseFaqContent(markdown);
    expect(parsed.frontmatter).toEqual({
      question: "How do I publish a draft?",
      status: "draft",
      sourceConversationId: "conv-1",
      sourceMessageId: "msg-2",
      mergedMessageIds: ["msg-9"],
    });
    expect(parsed.answer).toBe("Open it in Studio and choose Publish.");

    expect(faqAdapter.fromMarkdown(markdown)).toMatchObject({
      entityType: "faq",
      metadata: {
        question: "How do I publish a draft?",
        status: "draft",
        asked: 2,
      },
    });
  });

  it("counts a FAQ without merges as asked once", () => {
    const markdown = [
      "---",
      "question: What is a brain?",
      "status: draft",
      "sourceConversationId: conv-1",
      "sourceMessageId: msg-2",
      "---",
      "A personal knowledge service.",
    ].join("\n");

    expect(
      faqAdapter.parseFaqContent(markdown).frontmatter.mergedMessageIds,
    ).toEqual([]);
    expect(faqAdapter.fromMarkdown(markdown).metadata?.asked).toBe(1);
  });
});
