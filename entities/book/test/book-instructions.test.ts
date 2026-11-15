import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { createBookPlugins } from "./book-plugins";

describe("the book package's instructions", () => {
  it("grounds answers in the books, cited by siglum and quoted verbatim", async () => {
    const shell = createMockShell();
    const registered = await Promise.all(
      createBookPlugins().map((plugin) => plugin.register(shell)),
    );
    const instructions = registered
      .map((capabilities) => capabilities.instructions ?? "")
      .join("\n");

    expect(instructions).toContain(
      'system_search with scope { kind: "type", entityType: "book-section" }',
    );
    expect(instructions).toContain("by its siglum and its book's title");
    expect(instructions).toContain("verbatim, in the language of the text");
    expect(instructions).toContain("say that the books do not address it");
  });
});
