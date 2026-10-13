import { describe, expect, it } from "bun:test";
import { BookPlugin } from "../src/plugin";

class TestBookPlugin extends BookPlugin {
  public instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("BookPlugin instructions", () => {
  it("grounds answers in the books, cited by siglum and quoted verbatim", async () => {
    const instructions = (await new TestBookPlugin().instructions()) ?? "";

    expect(instructions).toContain(
      'system_search with scope { kind: "type", entityType: "book-section" }',
    );
    expect(instructions).toContain("by its siglum and its book's title");
    expect(instructions).toContain("verbatim, in the language of the text");
    expect(instructions).toContain("say that the books do not address it");
  });
});
