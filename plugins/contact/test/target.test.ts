import { describe, expect, it } from "bun:test";
import { formDefinitionSchema } from "@brains/forms";
import { CONTACT_FORM, contactRequestTarget } from "../src";

function form(
  fields: unknown[],
): ReturnType<typeof formDefinitionSchema.parse> {
  return formDefinitionSchema.parse({
    id: "work",
    target: "contact-request",
    title: "Work with us",
    steps: [{ fields }],
  });
}
const name = { kind: "text", id: "name", label: "Your name", required: true };
const email = { kind: "email", id: "email", label: "Email", required: true };

describe("contact requests as a form's target", () => {
  it("takes the contact form and any form asking for a name and an email", () => {
    expect(
      contactRequestTarget.refuse(
        formDefinitionSchema.parse(CONTACT_FORM.definition),
      ),
    ).toBeUndefined();
    expect(contactRequestTarget.refuse(form([name, email]))).toBeUndefined();
  });

  it("refuses a form whose answers a request cannot hold", () => {
    expect(
      contactRequestTarget.refuse(
        form([name, email, { kind: "text", id: "phone", label: "Phone" }]),
      ),
    ).toBe(
      'Form "work": a contact request holds no field "phone" of kind text',
    );
    expect(
      contactRequestTarget.refuse(
        form([name, { kind: "text", id: "email", label: "Email" }]),
      ),
    ).toBe(
      'Form "work": a contact request holds no field "email" of kind text',
    );
    expect(contactRequestTarget.refuse(form([name]))).toBe(
      'Form "work": a contact request needs "email", required',
    );
    expect(
      contactRequestTarget.refuse(
        formDefinitionSchema.parse({
          id: "work",
          target: "contact-request",
          title: "Work with us",
          steps: [{ fields: [name, email] }],
          notify: { enabled: false },
        }),
      ),
    ).toBe('Form "work": a contact request always alerts its owner');
  });

  it("labels the alert's answers as the form asked them", () => {
    const record = contactRequestTarget.record({
      form: form([name, email]),
      answers: { name: "Ada", email: "ada@example.com" },
      receivedAt: Date.parse("2026-11-07T10:00:00.000Z"),
      notify: true,
      results: [],
    });
    const entity = contactRequestTarget.schema.parse({
      id: "work-1",
      entityType: "contact-request",
      visibility: "restricted",
      content: record.content,
      contentHash: "x",
      created: "2026-11-07T10:00:00.000Z",
      updated: "2026-11-07T10:00:00.000Z",
      metadata: record.metadata,
    });
    expect(contactRequestTarget.alert(entity, form([name, email]))).toEqual({
      answers: [
        { label: "Your name", value: "Ada" },
        { label: "Email", value: "ada@example.com" },
        { label: "Message", value: "" },
      ],
      replyTo: "ada@example.com",
    });
  });
});
