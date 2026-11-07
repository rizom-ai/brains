import { describe, expect, it } from "bun:test";
import { formDefinitionSchema, formFields } from "../src";

const minimal = {
  id: "feedback",
  target: "contact-request",
  title: "Tell us",
  steps: [{ fields: [{ kind: "text", id: "name", label: "Name" }] }],
};

describe("a form definition", () => {
  it("fills in what a form leaves out", () => {
    const form = formDefinitionSchema.parse(minimal);
    expect(form.path).toBe("/forms/feedback");
    expect(form.submitLabel).toBe("Send");
    expect(form.notify).toEqual({
      enabled: true,
      title: "New submission: Tell us",
    });
    expect(form.thanks.title).toBe("Thank you");
    expect(formFields(form)).toEqual([
      {
        kind: "text",
        id: "name",
        label: "Name",
        required: false,
        maxLength: 200,
      },
    ]);
  });

  it("bounds each kind of field to what a post can carry", () => {
    const form = formDefinitionSchema.parse({
      ...minimal,
      steps: [
        {
          fields: [
            { kind: "email", id: "email", label: "Email", required: true },
            { kind: "longText", id: "message", label: "Message" },
          ],
        },
      ],
    });
    expect(formFields(form)).toEqual([
      {
        kind: "email",
        id: "email",
        label: "Email",
        required: true,
        maxLength: 254,
      },
      {
        kind: "longText",
        id: "message",
        label: "Message",
        required: false,
        maxLength: 4000,
      },
    ]);
    for (const field of [
      { kind: "email", id: "email", label: "Email", maxLength: 255 },
      { kind: "longText", id: "message", label: "Message", maxLength: 4001 },
      { kind: "text", id: "name", label: "" },
      { kind: "date", id: "when", label: "When" },
    ])
      expect(
        formDefinitionSchema.safeParse({
          ...minimal,
          steps: [{ fields: [field] }],
        }).success,
      ).toBe(false);
  });

  it("refuses the token and honeypot ids, repeated ids and a form without fields", () => {
    for (const steps of [
      [{ fields: [{ kind: "text", id: "token", label: "Token" }] }],
      [{ fields: [{ kind: "text", id: "website", label: "Website" }] }],
      [
        { fields: [{ kind: "text", id: "name", label: "Name" }] },
        { fields: [{ kind: "text", id: "name", label: "Name again" }] },
      ],
      [{ fields: [] }],
      [],
    ])
      expect(
        formDefinitionSchema.safeParse({ ...minimal, steps }).success,
      ).toBe(false);
  });

  it("takes a site path of its own, never another origin's or the thanks page's", () => {
    expect(
      formDefinitionSchema.parse({ ...minimal, path: "/contact" }).path,
    ).toBe("/contact");
    for (const path of [
      "contact",
      "//evil.test/x",
      "/a/../b",
      "/x?y",
      "/",
      "/x/",
    ])
      expect(formDefinitionSchema.safeParse({ ...minimal, path }).success).toBe(
        false,
      );
    for (const id of ["Feedback", "a b", "-x", "x".repeat(65)])
      expect(formDefinitionSchema.safeParse({ ...minimal, id }).success).toBe(
        false,
      );
  });
});

describe("a form's own limits and alert", () => {
  it("takes admission limits of its own, within the policy's bounds, and may send no alert", () => {
    const form = formDefinitionSchema.parse({
      ...minimal,
      limits: { globalSubmissions: 500, networkSubmissions: 20 },
      notify: { enabled: false },
    });
    expect(form.limits).toEqual({
      globalSubmissions: 500,
      networkSubmissions: 20,
    });
    expect(form.notify.enabled).toBe(false);
    for (const limits of [{ globalSubmissions: 0 }, { submissions: 5 }])
      expect(
        formDefinitionSchema.safeParse({ ...minimal, limits }).success,
      ).toBe(false);
  });
});
