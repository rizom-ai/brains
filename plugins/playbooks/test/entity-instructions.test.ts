import { describe, expect, it } from "bun:test";
import { PlaybookPlugin } from "../src/entity";

class TestPlaybookPlugin extends PlaybookPlugin {
  public instructions(): Promise<string> {
    return this.getInstructions();
  }
}

describe("PlaybookPlugin instructions", () => {
  it("routes playbook status checks to the canonical tool", async () => {
    const instructions = await new TestPlaybookPlugin().instructions();

    expect(instructions).toContain("call playbook_manage action=status");
    expect(instructions).not.toContain("playbook_status");
  });
});
