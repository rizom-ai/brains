import { describe, expect, it } from "bun:test";
import { getAgentDiscoveryInstructions } from "../src/lib/agent-instructions";

describe("getAgentDiscoveryInstructions", () => {
  it("describes agent directory domain semantics as typed tool contracts", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain("saved peer-brain contacts");
    expect(instructions).toContain("local agent directory");
    expect(instructions).toContain("discovered, approved, and archived");
    expect(instructions).toContain("agent_connect");
    expect(instructions).toContain("url source");
    expect(instructions).toContain("system_update field changes");
    expect(instructions).toContain(
      "Calling remote agents and saving local contact records are separate capabilities.",
    );
    expect(instructions).not.toContain("When the user");
  });
});
