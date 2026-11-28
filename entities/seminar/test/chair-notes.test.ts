import { describe, expect, it } from "bun:test";
import { chairNoteOf } from "../src/lib/chair-notes";

describe("a note as the chair reads it", () => {
  it("is the note's title and its body without the header", () => {
    expect(
      chairNoteOf({
        id: "religion",
        content:
          "---\ntitle: Religion\n---\n\nAll three read religion as an answer.\n",
        metadata: { title: "Religion" },
      }),
    ).toEqual({
      title: "Religion",
      text: "All three read religion as an answer.",
    });
  });

  it("goes by its id when it has no title", () => {
    expect(
      chairNoteOf({ id: "religion", content: "An answer.", metadata: {} }),
    ).toEqual({ title: "religion", text: "An answer." });
  });
});
