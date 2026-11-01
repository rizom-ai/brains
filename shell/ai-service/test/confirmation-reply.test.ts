import { describe, expect, it } from "bun:test";
import { composeConfirmationReply } from "../src/confirmation-reply";

// A turn that proposes an approval-gated action still shows what the agent
// wrote; the confirmation request goes below it.
describe("composeConfirmationReply", () => {
  it("keeps the agent's answer and asks for confirmation below it", () => {
    expect(
      composeConfirmationReply(
        "Customer: Beta Ops\nNext action: scope a status view.",
      ),
    ).toBe(
      "Customer: Beta Ops\nNext action: scope a status view.\n\nConfirmation required.",
    );
  });

  it("is the confirmation request alone when the agent wrote nothing", () => {
    expect(composeConfirmationReply("")).toBe("Confirmation required.");
    expect(composeConfirmationReply("  \n ")).toBe("Confirmation required.");
  });

  // Earlier replies in the history read "Confirmation required.", so the
  // agent can write the request itself; the reply asks once.
  it("asks once when the agent's text is only the request", () => {
    expect(composeConfirmationReply("Confirmation required.")).toBe(
      "Confirmation required.",
    );
    expect(composeConfirmationReply("confirmation required")).toBe(
      "Confirmation required.",
    );
  });

  it("trims the answer before the request", () => {
    expect(composeConfirmationReply("\nHere is the note.\n\n")).toBe(
      "Here is the note.\n\nConfirmation required.",
    );
  });
});
