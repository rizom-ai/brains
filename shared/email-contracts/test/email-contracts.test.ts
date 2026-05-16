import { describe, expect, it } from "bun:test";
import { EMAIL_SEND, sendEmailPayloadSchema } from "../src";

describe("email contracts", () => {
  it("defines the generic email send channel", () => {
    expect(EMAIL_SEND).toBe("email:send");
  });

  it("accepts a minimal transactional email payload", () => {
    const parsed = sendEmailPayloadSchema.parse({
      to: "user@example.com",
      subject: "Set up your Rover",
      text: "Open the setup link.",
    });

    expect(parsed).toEqual({
      to: "user@example.com",
      subject: "Set up your Rover",
      text: "Open the setup link.",
    });
  });

  it("accepts secret sensitivity metadata", () => {
    const parsed = sendEmailPayloadSchema.parse({
      to: "user@example.com",
      subject: "Set up your Rover",
      text: "Open the setup link.",
      sensitivity: "secret",
    });

    expect(parsed.sensitivity).toBe("secret");
  });

  it("rejects invalid recipient email addresses", () => {
    expect(() =>
      sendEmailPayloadSchema.parse({
        to: "not-an-email",
        subject: "Set up your Rover",
        text: "Open the setup link.",
      }),
    ).toThrow();
  });
});
