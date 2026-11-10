import { describe, expect, it } from "bun:test";
import { formDefinitionSchema, scoreAnswers } from "../src";

const outcomes = [
  { id: "seeking", title: "Seeking", body: "You look for what is next." },
  { id: "play", title: "Play" },
  { id: "care", title: "Care" },
];
const option = (
  value: string,
  dimension: string,
  outcome: string,
  weight?: number,
): unknown => ({
  value,
  label: value,
  scores: [{ dimension, outcome, ...(weight ? { weight } : {}) }],
});
const quiz = formDefinitionSchema.parse({
  id: "brand-test",
  target: "quiz-result",
  title: "Brand test",
  steps: [
    {
      fields: [
        {
          kind: "choice",
          id: "q1",
          label: "First",
          options: [
            option("a", "identity", "seeking", 2),
            option("b", "identity", "play", 2),
          ],
        },
        {
          kind: "choices",
          id: "q2",
          label: "Second",
          options: [
            option("a", "identity", "play"),
            option("b", "identity", "care"),
            option("c", "audience", "care"),
          ],
        },
        { kind: "text", id: "name", label: "Name" },
      ],
    },
  ],
  scoring: {
    dimensions: [
      { id: "identity", title: "Identity", outcomes },
      { id: "expression", title: "Expression", outcomes },
      { id: "audience", title: "Audience", outcomes },
    ],
  },
});

describe("a scored form", () => {
  it("gives each dimension its highest-scoring outcome, weighing each option", () => {
    // identity: seeking 2, play 1, care 1; audience: care 1; expression unanswered.
    expect(
      scoreAnswers(quiz, { q1: "a", q2: ["a", "b", "c"], name: "Ada" }),
    ).toEqual([
      { dimension: "identity", outcome: "seeking" },
      { dimension: "audience", outcome: "care" },
    ]);
  });

  it("breaks a tie by the order outcomes are listed in, and scores nothing for a form without scoring", () => {
    // identity: play 2 against care 1; then a tie of play and care, 1 each.
    expect(scoreAnswers(quiz, { q1: "b", q2: ["b"] })).toEqual([
      { dimension: "identity", outcome: "play" },
    ]);
    expect(scoreAnswers(quiz, { q2: ["a", "b"] })).toEqual([
      { dimension: "identity", outcome: "play" },
    ]);
    expect(
      scoreAnswers(
        formDefinitionSchema.parse({
          id: "plain",
          target: "quiz-result",
          title: "Plain",
          steps: [{ fields: [{ kind: "text", id: "name", label: "Name" }] }],
        }),
        { name: "Ada" },
      ),
    ).toEqual([]);
  });

  it("refuses a score towards a dimension or outcome the form does not have", () => {
    for (const scores of [
      [{ dimension: "nope", outcome: "seeking" }],
      [{ dimension: "identity", outcome: "nope" }],
      [{ dimension: "identity", outcome: "seeking", weight: 0 }],
    ])
      expect(
        formDefinitionSchema.safeParse({
          id: "x",
          target: "quiz-result",
          title: "X",
          steps: [
            {
              fields: [
                {
                  kind: "choice",
                  id: "q1",
                  label: "Q",
                  options: [{ value: "a", label: "A", scores }],
                },
              ],
            },
          ],
          scoring: {
            dimensions: [{ id: "identity", title: "Identity", outcomes }],
          },
        }).success,
      ).toBe(false);
  });
});
