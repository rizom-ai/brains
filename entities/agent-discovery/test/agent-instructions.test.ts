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
      "network_ask",
    ]) {
      expect(instructions).toContain(toolName);
    }
    expect(instructions).toContain(
      "agent_set_trust_level is the only tool for granting or revoking inbound A2A trust",
    );
    expect(instructions).toContain(
      "approve/archive an existing or discovered agent with system_update",
    );
    expect(instructions).toContain(
      "call system_update directly when it is callable",
    );
    expect(instructions).toContain("never substitute agent_connect");
    // A named domain is the contact's id: approving it is one update, with
    // no search, get, or list to find a record the request already names.
    expect(instructions).toContain("An agent's id is its domain");
    expect(instructions).toContain(
      "on entityType agent with that id and status approved or archived",
    );
    expect(instructions).toContain(
      "never substitute agent_connect or run system_search, system_get, or system_list first",
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
