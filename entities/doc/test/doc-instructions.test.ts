import { describe, expect, it } from "bun:test";
import { DocsPlugin } from "../src";

class TestDocsPlugin extends DocsPlugin {
  public instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("DocsPlugin instructions", () => {
  it("answers how-to questions from the docs, searched first and named by title", async () => {
    const instructions = (await new TestDocsPlugin().instructions()) ?? "";

    expect(instructions).toContain('Docs (entityType "doc")');
    expect(instructions).toContain(
      "run system_search before answering from general knowledge or asking the network",
    );
    expect(instructions).toContain(
      "name each doc you answer from by its title",
    );
  });
});
