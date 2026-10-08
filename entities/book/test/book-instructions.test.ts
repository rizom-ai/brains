import { describe, expect, it } from "bun:test";
import { book } from "../src/book-entity";

describe("BookPlugin instructions", () => {
  it("grounds answers in the books, cited by siglum and quoted verbatim", () => {
    const instructions = book.instructions ?? "";

    expect(instructions).toContain(
      'system_search with scope { kind: "type", entityType: "book" }',
    );
    expect(instructions).toContain("by its siglum and its book's title");
    expect(instructions).toContain("verbatim, in the language of the text");
    expect(instructions).toContain("say that the books do not address it");
  });
});
