import { describe, expect, it } from "bun:test";
import { GuidesPlugin } from "../src";

class TestGuidesPlugin extends GuidesPlugin {
  public instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("GuidesPlugin instructions", () => {
  it("answers who-am-I questions from the matching guide, named by its title", async () => {
    const instructions = (await new TestGuidesPlugin().instructions()) ?? "";

    expect(instructions).toContain("a writer, researcher, consultant, team");
    expect(instructions).toContain(
      'always run system_search with scope { kind: "type", entityType: "guide" } first',
    );
    expect(instructions).toContain(
      "before asking the network or answering from general knowledge",
    );
    expect(instructions).toContain(
      "Name the guide you answer from by its title",
    );
  });
});
