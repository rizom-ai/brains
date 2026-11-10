import { describe, expect, it } from "bun:test";
import { formDefinitionSchema, localizeForm } from "@brains/forms";
import { quizResultAdapter, quizResultTarget, type QuizResult } from "../src";

const options = [
  {
    value: "a",
    label: "Seeking",
    scores: [{ dimension: "identity", outcome: "seeking" }],
  },
  {
    value: "b",
    label: "Play",
    scores: [{ dimension: "identity", outcome: "play" }],
  },
];
const quiz = formDefinitionSchema.parse({
  id: "brand-test",
  target: "quiz-result",
  title: "Brand test",
  steps: [
    {
      fields: [
        { kind: "choice", id: "q1", label: "Who are you?", options },
        { kind: "choices", id: "q2", label: "And also?", options },
        { kind: "longText", id: "story", label: "Your story" },
      ],
    },
    {
      fields: [
        { kind: "text", id: "name", label: "Name" },
        { kind: "email", id: "email", label: "Email" },
      ],
    },
  ],
  scoring: {
    dimensions: [
      {
        id: "identity",
        title: "Identity",
        outcomes: [
          { id: "seeking", title: "Seeking" },
          { id: "play", title: "Play" },
        ],
      },
    ],
  },
  translations: {
    "zh-TW": {
      fields: { q1: { label: "你是誰？", options: { a: "探索" } } },
      dimensions: {
        identity: { title: "認同", outcomes: { seeking: { title: "探索" } } },
      },
    },
  },
});
const receivedAt = Date.parse("2026-11-07T10:00:00.000Z");
function entity(record: {
  content: string;
  metadata: Record<string, unknown>;
}): QuizResult {
  return quizResultTarget.schema.parse({
    id: "brand-test-1",
    entityType: "quiz-result",
    visibility: "restricted",
    content: record.content,
    contentHash: "x",
    created: "2026-11-07T10:00:00.000Z",
    updated: "2026-11-07T10:00:00.000Z",
    metadata: record.metadata,
  });
}

describe("a quiz result", () => {
  it("keeps each answer as the taker saw it and each result as shown", () => {
    const record = quizResultTarget.record({
      form: localizeForm(quiz, "zh-TW"),
      answers: {
        q1: "a",
        q2: ["a", "b"],
        story: "",
        name: "Ada",
        email: "ada@example.com",
      },
      receivedAt,
      notify: true,
      results: [{ dimension: "identity", outcome: "seeking" }],
      language: "zh-TW",
    });
    const { frontmatter } = quizResultAdapter.parseContent(record.content);
    expect(frontmatter).toEqual({
      quiz: "brand-test",
      language: "zh-TW",
      receivedAt: "2026-11-07T10:00:00.000Z",
      status: "new",
      notification: "pending",
      name: "Ada",
      email: "ada@example.com",
      results: [
        {
          dimension: "identity",
          title: "認同",
          outcome: "seeking",
          outcomeTitle: "探索",
        },
      ],
      answers: [
        { field: "q1", label: "你是誰？", value: "探索" },
        // Its options are not translated: the taker saw them as written.
        { field: "q2", label: "And also?", value: ["Seeking", "Play"] },
      ],
    });
    expect(record.metadata).toEqual({
      title: "Brand test",
      quiz: "brand-test",
      receivedAt: "2026-11-07T10:00:00.000Z",
      status: "new",
      notification: "pending",
      contact: true,
    });
    // A later edit to the quiz never changes what an older result says.
    const edited = formDefinitionSchema.parse({
      ...quiz,
      steps: [
        {
          fields: [
            {
              kind: "choice",
              id: "q9",
              label: "Renamed",
              options: [options[1]],
            },
          ],
        },
      ],
      translations: undefined,
    });
    expect(quizResultTarget.alert(entity(record), edited)).toEqual({
      answers: [
        { label: "你是誰？", value: "探索" },
        { label: "And also?", value: "Seeking, Play" },
      ],
      outcomes: [{ label: "認同", value: "探索" }],
      replyTo: "ada@example.com",
    });
  });

  it("holds no contact details the taker left out, and says when it sends no alert", () => {
    const record = quizResultTarget.record({
      form: quiz,
      answers: { q1: "b", q2: [], story: "x", name: "", email: "" },
      receivedAt,
      notify: false,
      results: [{ dimension: "identity", outcome: "play" }],
    });
    const { frontmatter } = quizResultAdapter.parseContent(record.content);
    expect(frontmatter).not.toHaveProperty("email");
    expect(frontmatter).not.toHaveProperty("name");
    expect(frontmatter).not.toHaveProperty("language");
    expect(frontmatter.notification).toBe("none");
    expect(frontmatter.answers).toContainEqual({
      field: "story",
      label: "Your story",
      value: "x",
    });
    expect(record.metadata["contact"]).toBe(false);
    expect(
      quizResultTarget.alert(entity(record), quiz).replyTo,
    ).toBeUndefined();
    expect(
      quizResultTarget.matches(entity(record), {
        form: quiz,
        answers: { q1: "b", q2: [], story: "x", name: "", email: "" },
        receivedAt,
        notify: false,
        results: [],
      }),
    ).toBe(true);
    expect(
      quizResultTarget.matches(entity(record), {
        form: quiz,
        answers: { q1: "a", q2: [], story: "x", name: "", email: "" },
        receivedAt,
        notify: false,
        results: [],
      }),
    ).toBe(false);
  });

  it("refuses a form whose name or email is not asked as one", () => {
    expect(quizResultTarget.refuse(quiz)).toBeUndefined();
    expect(
      quizResultTarget.refuse(
        formDefinitionSchema.parse({
          ...quiz,
          translations: undefined,
          steps: [{ fields: [{ kind: "text", id: "email", label: "Email" }] }],
          scoring: undefined,
        }),
      ),
    ).toBe('Form "brand-test": a quiz result takes "email" as an email field');
  });
});
