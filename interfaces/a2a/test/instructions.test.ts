import { describe, expect, it } from "bun:test";
import { A2AInterface } from "../src/a2a-interface";

class TestA2AInterface extends A2AInterface {
  public async instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("A2A instructions", () => {
  it("provides agent-facing instructions", async () => {
    const plugin = new TestA2AInterface({ port: 0 });
    const instructions = await plugin.instructions();

    expect(instructions).toBeString();
    expect(instructions?.trim().length).toBeGreaterThan(0);
  });
});
