import { describe, expect, it } from "bun:test";
import { buildInstructions } from "../src/brain-instructions";

const identity = {
  name: "Team Brain",
  role: "Team memory",
  purpose: "Keep the team's work together",
  values: ["clarity"],
};

describe("brain instructions", () => {
  it("tell the agent today's date, so it can resolve relative dates", () => {
    const instructions = buildInstructions(
      identity,
      "trusted",
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      new Date("2026-10-24T16:00:00.000Z"),
    );

    expect(instructions).toContain("Today is Saturday 2026-10-24 (UTC).");
  });

  // The system tools' Entity CRUD rules say how a write is confirmed; a second
  // copy here was resent on every step.
  it("leave write confirmation to the system tool rules", () => {
    const instructions = buildInstructions(identity, "admin");

    expect(instructions).not.toContain("confirmation in prose");
    expect(instructions).not.toContain("self-confirm");
    expect(instructions).toContain(
      "If a tool returns a permission denial, report it concisely",
    );
  });
});
