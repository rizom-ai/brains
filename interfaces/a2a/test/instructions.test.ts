import { describe, expect, it } from "bun:test";
import { A2AInterface } from "../src/a2a-interface";

class TestA2AInterface extends A2AInterface {
  public async instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("A2A instructions", () => {
  it("treats asking what a saved agent has to say as an A2A call", async () => {
    const plugin = new TestA2AInterface({ port: 0 });
    const instructions = await plugin.instructions();

    expect(instructions).toContain("hear what a saved agent has to say");
    expect(instructions).toContain("call `a2a_call` in the same turn");
    expect(instructions).toContain("reading the saved agent entity metadata");
    expect(instructions).toContain(
      "If the user names an exact saved local agent id such as `yeehaa.io`, call `a2a_call` directly",
    );
    expect(instructions).toContain("Do not preflight with `system_list`");
    expect(instructions).toContain(
      "use that same id again for the follow-up even if the previous response was a refusal or error",
    );
  });
});
