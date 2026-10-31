import { describe, expect, it } from "bun:test";
import { A2AInterface } from "../src/a2a-interface";
import { createAgentCallTool } from "../src/client";

class TestA2AInterface extends A2AInterface {
  public async instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

// Calling guidance travels with agent_call: its description reaches the model
// only when the caller may call agents, and once per step instead of twice.
describe("A2A instructions", () => {
  it("adds no prompt section beside the agent_call description", async () => {
    const plugin = new TestA2AInterface({ port: 0 });

    expect(await plugin.instructions()).toBeUndefined();
  });

  it("describes when and how to call an agent", () => {
    const { description } = createAgentCallTool();

    expect(description).toContain("bare text with a dot and no slash/protocol");
    expect(description).toContain("no system_list/system_get preflight");
    expect(description).toContain("Do not stop after listing the agent");
    expect(description).toContain("pass only the hostname docs.rizom.ai");
    expect(description).toContain("ask for the HTTPS agent URL or exact id");
    expect(description).toContain("discovered but not approved");
    expect(description).toContain("never auto-save");
    expect(description).toContain(
      "without supplementing it with reads of the agent entity",
    );
  });

  it("describes how to handle a failed or repeated call", () => {
    const { description } = createAgentCallTool();

    expect(description).toContain("report that failure directly");
    expect(description).toContain("using the word add");
    expect(description).toContain(
      "do not create a wish, reminder, todo, note, or other entity",
    );
    expect(description).toContain("needs its own fresh call");
    expect(description).toContain("even after a refusal or error");
    expect(description).toContain("never choose the first match");
    expect(description).toContain("end the turn without calling");
  });
});
