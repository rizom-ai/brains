import { describe, expect, it } from "bun:test";
import { A2AInterface } from "../src/a2a-interface";

class TestA2AInterface extends A2AInterface {
  public async instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("A2A instructions", () => {
  it("treats exact domain-like agent ids as agent calls", async () => {
    const plugin = new TestA2AInterface({ port: 0 });
    const instructions = await plugin.instructions();

    expect(instructions).toContain(
      "hear what an exact domain-like agent id has to say",
    );
    expect(instructions).toContain("call `agent_call` in the same turn");
    expect(instructions).toContain("reading saved agent entity metadata");
    expect(instructions).toContain(
      "If the user names an exact domain-like agent id such as `yeehaa.io` or `docs.rizom.ai`, call `agent_call` directly",
    );
    expect(instructions).toContain("Do not preflight with `system_list`");
    expect(instructions).toContain(
      "use that same id again for the follow-up even if the previous response was a refusal or error",
    );
    expect(instructions).toContain(
      "Do not create, capture, or generate a note containing the user's question",
    );
    expect(instructions).toContain("Use `agent_connect`");
    expect(instructions).toContain("before any network contact");
    expect(instructions).toContain("For full URLs and ambiguous display names");
  });

  it("forbids memory/local-doc fallbacks when a saved-agent call fails", async () => {
    const plugin = new TestA2AInterface({ port: 0 });
    const instructions = await plugin.instructions();

    expect(instructions).toContain(
      "If `agent_call` fails because auth, re-authentication, network, or the remote agent is unavailable",
    );
    expect(instructions).toContain("report that failure directly");
    expect(instructions).toContain(
      "Do not answer from memory, local docs, onboarding docs, or general knowledge",
    );
  });
});
