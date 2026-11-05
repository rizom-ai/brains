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
    // Guides are few, one per kind of user: listing them finds the match
    // however weakly the question's wording scores against a guide's text.
    expect(instructions).toContain(
      'first run system_list with entityType "guide"',
    );
    expect(instructions).toContain(
      "Read the guide that fits the person with system_get",
    );
    expect(instructions).not.toContain("system_search");
    // Running a brain of one's own is a guide's subject, not only a how-to.
    expect(instructions).toContain(
      "how to run a brain of their own, such as on their own server",
    );
    expect(instructions).toContain(
      "A guide question is answered from its guide alone",
    );
    expect(instructions).toContain(
      "before asking the network or answering from general knowledge",
    );
    expect(instructions).toContain(
      "Name the guide you answer from by its title",
    );
  });
});
