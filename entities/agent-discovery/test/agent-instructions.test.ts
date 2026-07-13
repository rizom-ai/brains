import { describe, expect, it } from "bun:test";
import { getAgentDiscoveryInstructions } from "../src/lib/agent-instructions";

describe("getAgentDiscoveryInstructions", () => {
  it("keeps the stable agent tool contracts concise", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions.length).toBeLessThan(2_000);
    for (const toolName of [
      "system_list",
      "system_search",
      "system_update",
      "agent_connect",
      "agent_call",
      "agent_set_trust_level",
    ]) {
      expect(instructions).toContain(toolName);
    }
    expect(instructions).toContain(
      "agent_set_trust_level is the only tool for granting or revoking inbound A2A trust",
    );
    expect(instructions).toContain("returned entity id/domain");
    expect(instructions).toContain("never recommend archived contacts");
  });
});
