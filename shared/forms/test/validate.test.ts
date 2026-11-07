import { describe, expect, it } from "bun:test";
import { formDefinitionSchema, validateAnswers } from "../src";

const form = formDefinitionSchema.parse({
  id: "contact",
  target: "contact-request",
  title: "Write",
  steps: [
    {
      fields: [
        {
          kind: "text",
          id: "name",
          label: "Name",
          required: true,
          maxLength: 120,
        },
        { kind: "email", id: "email", label: "Email", required: true },
        { kind: "longText", id: "message", label: "Message", maxLength: 4000 },
      ],
    },
  ],
});

describe("answers to a form", () => {
  it("trims each answer and gives an optional one left out as empty", () => {
    expect(
      validateAnswers(form, {
        name: " Ada ",
        email: " ada@example.com ",
        website: "",
      }),
    ).toEqual({
      ok: true,
      answers: { name: "Ada", email: "ada@example.com", message: "" },
    });
  });

  it("names each field that fails and why", () => {
    expect(
      validateAnswers(form, {
        name: "",
        email: "not an address",
        message: "x".repeat(4001),
        website: "",
      }),
    ).toEqual({
      ok: false,
      errors: {
        name: "Name is required.",
        email: "Enter an email address.",
        message: "Message is too long: at most 4000 characters.",
      },
    });
  });

  it("refuses a filled honeypot and a field the form does not have", () => {
    const valid = { name: "Ada", email: "ada@example.com" };
    expect(validateAnswers(form, { ...valid, website: "spam" })).toEqual({
      ok: false,
      errors: {},
    });
    expect(validateAnswers(form, { ...valid, visibility: "public" })).toEqual({
      ok: false,
      errors: {},
    });
  });
});

describe("answers to choice fields", () => {
  const options = [
    { value: "a", label: "Seeking" },
    { value: "b", label: "Play" },
    { value: "c", label: "Care" },
  ];
  const quiz = formDefinitionSchema.parse({
    id: "quiz",
    target: "quiz-result",
    title: "Quiz",
    steps: [
      {
        fields: [
          { kind: "choice", id: "q1", label: "One", options, required: true },
          { kind: "choices", id: "q2", label: "Some", options, max: 2 },
        ],
      },
    ],
  });

  it("takes an option on the list, and a set of them once each", () => {
    expect(validateAnswers(quiz, { q1: "b", q2: ["a", "c", "a"] })).toEqual({
      ok: true,
      answers: { q1: "b", q2: ["a", "c"] },
    });
    expect(validateAnswers(quiz, { q1: "a" })).toEqual({
      ok: true,
      answers: { q1: "a", q2: [] },
    });
  });

  it("names a missing choice, an option not on the list and too many chosen", () => {
    expect(validateAnswers(quiz, { q2: ["a", "z"] })).toEqual({
      ok: false,
      errors: {
        q1: "Choose an answer to One.",
        q2: "Choose from the options given for Some.",
      },
    });
    expect(validateAnswers(quiz, { q1: "z", q2: ["a", "b", "c"] })).toEqual({
      ok: false,
      errors: {
        q1: "Choose from the options given for One.",
        q2: "Choose at most 2 for Some.",
      },
    });
    // A text answer to a list, or a list to a text field, is not this form's post.
    expect(validateAnswers(quiz, { q1: ["a", "b"] })).toEqual({
      ok: false,
      errors: {},
    });
    expect(validateAnswers(form, { name: ["Ada"], email: "a@b.co" })).toEqual({
      ok: false,
      errors: {},
    });
  });
});
