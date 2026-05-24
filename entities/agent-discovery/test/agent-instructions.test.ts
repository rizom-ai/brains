import { describe, expect, it } from "bun:test";
import { getAgentDiscoveryInstructions } from "../src/lib/agent-instructions";

describe("getAgentDiscoveryInstructions", () => {
  it("treats asking what a saved agent has to say as an A2A contact request", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain("what does <agent> have to say");
    expect(instructions).toContain("use `a2a_call`");
    expect(instructions).toContain(
      "rather than answering from local saved agent metadata",
    );
  });
});
