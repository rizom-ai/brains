import { describe, expect, it } from "bun:test";
import { quizResultAdapter, type QuizResultFrontmatter } from "../src";

const taken: QuizResultFrontmatter = {
  quiz: "brand-test",
  quizTitle: "Brand personality test",
  receivedAt: "2026-11-07T10:00:00.000Z",
  status: "new",
  notification: "none",
  email: "ada@example.com",
  results: [
    {
      dimension: "identity",
      title: "Identity",
      outcome: "seeking",
      outcomeTitle: "Seeking",
    },
  ],
  answers: [{ field: "q1", label: "Who are you?", value: "Seeking" }],
};

describe("a quiz result's markdown", () => {
  it("reads back under the title of the quiz as it was taken", () => {
    const markdown = quizResultAdapter.createContent(taken);
    expect(quizResultAdapter.fromMarkdown(markdown).metadata).toEqual({
      title: "Brand personality test",
      quiz: "brand-test",
      receivedAt: "2026-11-07T10:00:00.000Z",
      status: "new",
      notification: "none",
      contact: true,
    });
  });

  it("written before it kept its quiz's title, reads under the quiz's id", () => {
    const { quizTitle: _quizTitle, ...legacy } = taken;
    const markdown = quizResultAdapter.createContent(legacy);
    expect(quizResultAdapter.fromMarkdown(markdown).metadata?.title).toBe(
      "brand-test",
    );
  });
});
