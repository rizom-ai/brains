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
      "agent_set_standing",
      "network_ask",
    ]) {
      expect(instructions).toContain(toolName);
    }
    expect(instructions).toContain(
      "agent_set_standing with level is the only way to grant or revoke inbound A2A trust",
    );
    expect(instructions).toContain(
      "approve, restore or archive a saved agent with agent_set_standing;",
    );
    expect(instructions).toContain(
      "call agent_set_standing directly when it is callable",
    );
    expect(instructions).toContain("Never substitute agent_connect");
    // A named domain is the contact's id: approving it is one update, with
    // no search, get, or list to find a record the request already names.
    expect(instructions).toContain("An agent's id is its domain");
    expect(instructions).toContain(
      "with that id as agent and contact approved or archived",
    );
    expect(instructions).toContain(
      "never run system_search, system_get, or system_list first",
    );
    expect(instructions).toContain(
      "agent_connect only to verify and save a new domain/URL",
    );
    expect(instructions).toContain("returned entity id/domain");
    expect(instructions).toContain("never recommend archived contacts");
    expect(instructions).toContain("using only the requested topic verbatim");
    // A recommendation is one search; listing the directory first only adds a
    // model step.
    expect(instructions).toContain(
      "scoped to entityType agent, and no system_list, using only the requested topic verbatim",
    );
    expect(instructions).toContain(
      "after a system_search of this brain found little on the question",
    );
  });
});
