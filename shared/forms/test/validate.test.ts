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
