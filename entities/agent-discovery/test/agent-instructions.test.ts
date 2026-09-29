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
      "agents_connect",
      "a2a_call",
      "agents_set-trust-level",
    ]) {
      expect(instructions).toContain(toolName);
    }
    expect(instructions).toContain(
      "agents_set-trust-level is the only tool for granting or revoking inbound A2A trust",
    );
    expect(instructions).toContain(
      "approve/archive an existing or discovered agent with system_update",
    );
    expect(instructions).toContain(
      "call system_update directly when it is callable",
    );
    expect(instructions).toContain("never substitute agents_connect");
    expect(instructions).toContain(
      "agents_connect only to verify and save a new domain/URL",
    );
    expect(instructions).toContain("returned entity id/domain");
    expect(instructions).toContain("never recommend archived contacts");
    expect(instructions).toContain("using only the requested topic verbatim");
  });
});
