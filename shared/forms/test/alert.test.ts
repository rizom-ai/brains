import { describe, expect, it } from "bun:test";
import { formAlertText } from "../src";

const inboxUrl = "https://brain.test/studio/workspaces/unified-inbox%3Ainbox";

describe("a form's alert", () => {
  it("carries each answer under its label and the Inbox link", () => {
    expect(
      formAlertText({
        answers: [
          { label: "Name", value: "Ada" },
          { label: "Email", value: "ada@example.com" },
          { label: "Message", value: "Two lines\nof text" },
        ],
        inboxUrl,
        replyable: true,
      }),
    ).toBe(
      [
        "Name: Ada",
        "Email: ada@example.com",
        "Message:",
        "Two lines",
        "of text",
        "",
        "Reply to this email to answer.",
        `Mark it done in your Inbox: ${inboxUrl}`,
      ].join("\n"),
    );
  });

  it("leaves out answers left empty and the reply line when there is no one to answer", () => {
    expect(
      formAlertText({
        answers: [
          { label: "Name", value: "Ada" },
          { label: "Message", value: "" },
        ],
        inboxUrl,
        replyable: false,
      }),
    ).toBe(`Name: Ada\n\nMark it done in your Inbox: ${inboxUrl}`);
  });
});
